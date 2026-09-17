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
  candidateUnitId: string | null;
  isUnitLeader: boolean;
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
  const candidate = u.unit_id?.startsWith("candidate:") ? u.unit_id.slice("candidate:".length) : null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    status: u.status,
    unitId: candidate ? null : u.unit_id,
    unitLabel: u.unit_label,
    propertyName: u.property_name,
    candidateUnitId: candidate,
    isUnitLeader: Boolean(u.unit_id && !candidate),
  };
}

interface OwnerUnitLeadersContextValue {
  unitLeaders: UnitLeaderRecord[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  assignUnitLeader: (tenantId: string, unitId: string) => Promise<void>;
  unassignUnitLeader: (tenantId: string) => Promise<void>;
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
    void refresh();
  }, [refresh]);

  const assignUnitLeader = async (tenantId: string, unitId: string) => {
    await api.patch(`/api/owner/unit-leaders/${tenantId}/unit`, { unitId });
    await refresh();
  };

  const unassignUnitLeader = async (tenantId: string) => {
    await api.patch(`/api/owner/unit-leaders/${tenantId}/unit`, { unitId: null });
    await refresh();
  };

  return (
    <OwnerUnitLeadersContext.Provider
      value={{ unitLeaders, loading, error, refresh, assignUnitLeader, unassignUnitLeader }}
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
