import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import type { PaymentStatus, UtilityType } from "@/types";

export interface AgentUtilityRecord {
  id: string;
  unitId: string;
  type: UtilityType;
  month: string; // 'YYYY-MM'
  amountCents: number;
  status: PaymentStatus;
  receiptKey: string | null;
  submittedAt: string | null;
  paymentDate: string | null;
  propertyName: string;
  unitLabel: string;
  leaderName: string | null;
}

interface ApiAgentUtility {
  id: string;
  unit_id: string;
  type: UtilityType;
  month: string;
  amount: number;
  status: PaymentStatus;
  receipt_key: string | null;
  submitted_at: string | null;
  payment_date: string | null;
  property_name: string;
  unit_label: string;
  leader_name: string | null;
}

function fromApi(u: ApiAgentUtility): AgentUtilityRecord {
  return {
    id: u.id,
    unitId: u.unit_id,
    type: u.type,
    month: u.month,
    amountCents: u.amount,
    status: u.status,
    receiptKey: u.receipt_key,
    submittedAt: u.submitted_at,
    paymentDate: u.payment_date,
    propertyName: u.property_name,
    unitLabel: u.unit_label,
    leaderName: u.leader_name,
  };
}

interface AgentUtilitiesContextValue {
  records: AgentUtilityRecord[];
  loading: boolean;
  error: string | null;
  getRecord: (id: string) => AgentUtilityRecord | undefined;
  refresh: () => Promise<void>;
  confirmUtility: (id: string) => Promise<void>;
  rejectUtility: (id: string, reason?: string) => Promise<void>;
}

const AgentUtilitiesContext = createContext<AgentUtilitiesContextValue | null>(null);

export function AgentUtilitiesProvider({ children }: { children: ReactNode }) {
  const [records, setRecords] = useState<AgentUtilityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<{ utilities: ApiAgentUtility[] }>("/api/agent/utilities/pending");
      setRecords(data.utilities.map(fromApi));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load pending utility payments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const getRecord = (id: string) => records.find((r) => r.id === id);

  const confirmUtility = async (id: string) => {
    await api.post(`/api/agent/utilities/${id}/confirm`);
    setRecords((prev) => prev.filter((r) => r.id !== id));
  };

  const rejectUtility = async (id: string, reason?: string) => {
    await api.post(`/api/agent/utilities/${id}/reject`, reason ? { reason } : undefined);
    setRecords((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <AgentUtilitiesContext.Provider
      value={{ records, loading, error, getRecord, refresh, confirmUtility, rejectUtility }}
    >
      {children}
    </AgentUtilitiesContext.Provider>
  );
}

export function useAgentUtilities(): AgentUtilitiesContextValue {
  const ctx = useContext(AgentUtilitiesContext);
  if (!ctx) throw new Error("useAgentUtilities must be used within AgentUtilitiesProvider");
  return ctx;
}
