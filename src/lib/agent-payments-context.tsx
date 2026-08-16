import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import type { PaymentStatus } from "@/types";

export interface AgentPaymentRecord {
  id: string;
  leaseId: string;
  month: string; // 'YYYY-MM'
  amountCents: number;
  dueDate: string;
  status: PaymentStatus;
  receiptKey: string | null;
  submittedAt: string | null;
  paymentDate: string | null;
  tenantId: string;
  tenantName: string;
  propertyName: string;
  unitLabel: string;
}

interface ApiAgentPayment {
  id: string;
  lease_id: string;
  month: string;
  amount: number;
  due_date: string;
  status: PaymentStatus;
  receipt_key: string | null;
  submitted_at: string | null;
  payment_date: string | null;
  tenant_id: string;
  tenant_name: string;
  property_name: string;
  unit_label: string;
}

function fromApi(p: ApiAgentPayment): AgentPaymentRecord {
  return {
    id: p.id,
    leaseId: p.lease_id,
    month: p.month,
    amountCents: p.amount,
    dueDate: p.due_date,
    status: p.status,
    receiptKey: p.receipt_key,
    submittedAt: p.submitted_at,
    paymentDate: p.payment_date,
    tenantId: p.tenant_id,
    tenantName: p.tenant_name,
    propertyName: p.property_name,
    unitLabel: p.unit_label,
  };
}

interface AgentPaymentsContextValue {
  records: AgentPaymentRecord[];
  loading: boolean;
  error: string | null;
  getRecord: (id: string) => AgentPaymentRecord | undefined;
  refresh: () => Promise<void>;
  confirmPayment: (id: string) => Promise<void>;
  rejectPayment: (id: string, reason?: string) => Promise<void>;
}

const AgentPaymentsContext = createContext<AgentPaymentsContextValue | null>(null);

export function AgentPaymentsProvider({ children }: { children: ReactNode }) {
  const [records, setRecords] = useState<AgentPaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<{ payments: ApiAgentPayment[] }>("/api/agent/payments/pending");
      setRecords(data.payments.map(fromApi));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load pending payments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const getRecord = (id: string) => records.find((r) => r.id === id);

  const confirmPayment = async (id: string) => {
    await api.post(`/api/agent/payments/${id}/confirm`);
    setRecords((prev) => prev.filter((r) => r.id !== id));
  };

  const rejectPayment = async (id: string, reason?: string) => {
    await api.post(`/api/agent/payments/${id}/reject`, reason ? { reason } : undefined);
    setRecords((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <AgentPaymentsContext.Provider
      value={{ records, loading, error, getRecord, refresh, confirmPayment, rejectPayment }}
    >
      {children}
    </AgentPaymentsContext.Provider>
  );
}

export function useAgentPayments(): AgentPaymentsContextValue {
  const ctx = useContext(AgentPaymentsContext);
  if (!ctx) throw new Error("useAgentPayments must be used within AgentPaymentsProvider");
  return ctx;
}
