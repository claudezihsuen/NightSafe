import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api, ApiError } from "@/lib/api";

export interface UnitLeaderRecord {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: "ACTIVE" | "WAITING_FOR_ACTIVATION" | "INACTIVE";
  unitId: string | null;
  unitLabel: string | null;
  propertyName: string | null;
}

interface ApiUnitLeader {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: UnitLeaderRecord["status"];
  unit_id: string | null;
  unit_label: string | null;
  property_name: string | null;
}

function fromApi(u: ApiUnitLeader): UnitLeaderRecord {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    status: u.status,
    unitId: u.unit_id,
    unitLabel: u.unit_label,
    propertyName: u.property_name,
  };
}

interface OwnerUnitLeadersContextValue {
  unitLeaders: UnitLeaderRecord[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  // Throws ApiError with status 409 if the target unit already has a leader —
  // its .message already names them; callers offer a "confirm replace" retry.
  createUnitLeader: (
    input: { name: string; email: string; phone?: string; unitId: string },
    confirmReplace?: boolean,
  ) => Promise<{ inviteLink: string }>;
  reassignUnitLeader: (leaderId: string, unitId: string, confirmReplace?: boolean) => Promise<void>;
}

const OwnerUnitLeadersContext = createContext<OwnerUnitLeadersContextValue | null>(null);

export function OwnerUnitLeadersProvider({ children }: { children: ReactNode }) {
  const [unitLeaders, setUnitLeaders] = useState<UnitLeaderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<{ unitLeaders: ApiUnitLeader[] }>("/api/owner/unit-leaders");
      setUnitLeaders(data.unitLeaders.map(fromApi));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load unit leaders.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createUnitLeader: OwnerUnitLeadersContextValue["createUnitLeader"] = async (input, confirmReplace) => {
    const data = await api.post<{ inviteLink: string }>("/api/owner/unit-leaders", {
      ...input,
      confirmReplace: confirmReplace ?? false,
    });
    await refresh();
    return data;
  };

  const reassignUnitLeader = async (leaderId: string, unitId: string, confirmReplace?: boolean) => {
    await api.patch(`/api/owner/unit-leaders/${leaderId}/unit`, { unitId, confirmReplace: confirmReplace ?? false });
    await refresh();
  };

  return (
    <OwnerUnitLeadersContext.Provider
      value={{ unitLeaders, loading, error, refresh, createUnitLeader, reassignUnitLeader }}
    >
      {children}
    </OwnerUnitLeadersContext.Provider>
  );
}

export function useOwnerUnitLeaders(): OwnerUnitLeadersContextValue {
  const ctx = useContext(OwnerUnitLeadersContext);
  if (!ctx) throw new Error("useOwnerUnitLeaders must be used within OwnerUnitLeadersProvider");
  return ctx;
}
