import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import type { PaymentStatus, UtilityType } from "@/types";

export interface UnitInfo {
  id: string;
  label: string;
  property_id: string;
  property_name: string;
  property_address: string;
}

export interface UtilityRecord {
  id: string;
  type: UtilityType;
  month: string; // 'YYYY-MM'
  amountCents: number;
  status: PaymentStatus;
  receiptKey: string | null;
  submittedAt: string | null;
  paymentDate: string | null;
}

interface ApiUtility {
  id: string;
  type: UtilityType;
  month: string;
  amount: number;
  status: PaymentStatus;
  receipt_key: string | null;
  submitted_at: string | null;
  payment_date: string | null;
}

function fromApi(u: ApiUtility): UtilityRecord {
  return {
    id: u.id,
    type: u.type,
    month: u.month,
    amountCents: u.amount,
    status: u.status,
    receiptKey: u.receipt_key,
    submittedAt: u.submitted_at,
    paymentDate: u.payment_date,
  };
}

interface UnitLeaderContextValue {
  unit: UnitInfo | null;
  utilities: UtilityRecord[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  submitUtility: (type: UtilityType, month: string, amountDollars: string, receipt: File) => Promise<void>;
}

const UnitLeaderContext = createContext<UnitLeaderContextValue | null>(null);

export function UnitLeaderProvider({ children }: { children: ReactNode }) {
  const [unit, setUnit] = useState<UnitInfo | null>(null);
  const [utilities, setUtilities] = useState<UtilityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [unitData, utilitiesData] = await Promise.all([
        api.get<{ unit: UnitInfo }>("/api/unit-leader/unit").catch(() => ({ unit: null })),
        api.get<{ utilities: ApiUtility[] }>("/api/unit-leader/utilities"),
      ]);
      setUnit(unitData.unit);
      setUtilities(utilitiesData.utilities.map(fromApi));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load your unit.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const submitUtility = async (type: UtilityType, month: string, amountDollars: string, receipt: File) => {
    const form = new FormData();
    form.set("type", type);
    form.set("month", month);
    form.set("amount", amountDollars);
    form.set("receipt", receipt);
    await api.postForm(`/api/unit-leader/utilities/submit`, form);
    await refresh();
  };

  return (
    <UnitLeaderContext.Provider value={{ unit, utilities, loading, error, refresh, submitUtility }}>
      {children}
    </UnitLeaderContext.Provider>
  );
}

export function useUnitLeader(): UnitLeaderContextValue {
  const ctx = useContext(UnitLeaderContext);
  if (!ctx) throw new Error("useUnitLeader must be used within UnitLeaderProvider");
  return ctx;
}
