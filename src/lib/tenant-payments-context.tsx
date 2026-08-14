import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import type { PaymentStatus } from "@/types";

export interface RentRecord {
  id: string;
  leaseId: string;
  month: string; // 'YYYY-MM'
  amountCents: number;
  dueDate: string; // 'YYYY-MM-DD'
  status: PaymentStatus;
  receiptKey: string | null;
  submittedAt: string | null;
  paymentDate: string | null;
  reviewedByName: string | null;
}

interface ApiRentPayment {
  id: string;
  lease_id: string;
  month: string;
  amount: number;
  due_date: string;
  status: PaymentStatus;
  receipt_key: string | null;
  submitted_at: string | null;
  payment_date: string | null;
  reviewed_by_name: string | null;
}

function fromApi(p: ApiRentPayment): RentRecord {
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
    reviewedByName: p.reviewed_by_name,
  };
}

interface TenantPaymentsContextValue {
  records: RentRecord[];
  loading: boolean;
  error: string | null;
  getRecord: (id: string) => RentRecord | undefined;
  currentRecord: RentRecord | undefined; // most recent month — drives the dashboard
  refresh: () => Promise<void>;
  submitPayment: (id: string, receipt: File) => Promise<void>;
}

const TenantPaymentsContext = createContext<TenantPaymentsContextValue | null>(null);

export function TenantPaymentsProvider({ children }: { children: ReactNode }) {
  const [records, setRecords] = useState<RentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<{ payments: ApiRentPayment[] }>("/api/tenant/payments");
      setRecords(data.payments.map(fromApi));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load your payments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const getRecord = (id: string) => records.find((r) => r.id === id);
  const currentRecord = records[0];

  const submitPayment = async (id: string, receipt: File) => {
    const form = new FormData();
    form.set("receipt", receipt);
    const data = await api.postForm<{ payment: ApiRentPayment }>(`/api/tenant/payments/${id}/submit`, form);
    const updated = fromApi(data.payment);
    setRecords((prev) => prev.map((r) => (r.id === id ? updated : r)));
  };

  return (
    <TenantPaymentsContext.Provider
      value={{ records, loading, error, getRecord, currentRecord, refresh, submitPayment }}
    >
      {children}
    </TenantPaymentsContext.Provider>
  );
}

export function useTenantPayments(): TenantPaymentsContextValue {
  const ctx = useContext(TenantPaymentsContext);
  if (!ctx) throw new Error("useTenantPayments must be used within TenantPaymentsProvider");
  return ctx;
}
