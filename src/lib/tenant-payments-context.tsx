import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import type { RentStatus } from "@/types";

export interface RentRecord {
  id: string; // e.g. "2026-08" — used as the route param
  monthLabel: string; // e.g. "August 2026"
  amount: string;
  dueDate: string;
  status: RentStatus;
  submittedDate?: string;
  paymentDate?: string;
  reviewedBy?: string;
  rejectionReason?: string;
  note?: string;
  method?: string;
  receiptFileName?: string;
}

const initialRecords: RentRecord[] = [
  {
    id: "2026-08",
    monthLabel: "August 2026",
    amount: "$1,200.00",
    dueDate: "Aug 15, 2026",
    status: "WAITING_PAYMENT",
  },
  {
    id: "2026-07",
    monthLabel: "July 2026",
    amount: "$1,200.00",
    dueDate: "Jul 5, 2026",
    status: "PAID",
    submittedDate: "Jul 2, 2026",
    paymentDate: "Jul 3, 2026",
    reviewedBy: "James Okoro (Agent)",
    receiptFileName: "july-rent-receipt.jpg",
  },
  {
    id: "2026-06",
    monthLabel: "June 2026",
    amount: "$1,200.00",
    dueDate: "Jun 5, 2026",
    status: "PENDING",
    submittedDate: "Jun 4, 2026",
    receiptFileName: "june-rent-receipt.pdf",
  },
  {
    id: "2026-05",
    monthLabel: "May 2026",
    amount: "$1,200.00",
    dueDate: "May 5, 2026",
    status: "PAYMENT_CONFIRMED",
    submittedDate: "May 3, 2026",
    paymentDate: "May 4, 2026",
    reviewedBy: "Sarah Chen (Owner)",
    receiptFileName: "may-rent-receipt.jpg",
  },
  {
    id: "2026-04",
    monthLabel: "April 2026",
    amount: "$1,200.00",
    dueDate: "Apr 5, 2026",
    status: "REJECTED",
    submittedDate: "Apr 6, 2026",
    reviewedBy: "James Okoro (Agent)",
    rejectionReason: "Receipt image was blurry — please re-upload a clearer photo.",
    receiptFileName: "april-rent-receipt.jpg",
  },
  {
    id: "2026-03",
    monthLabel: "March 2026",
    amount: "$1,200.00",
    dueDate: "Mar 5, 2026",
    status: "PAID",
    submittedDate: "Mar 3, 2026",
    paymentDate: "Mar 4, 2026",
    reviewedBy: "James Okoro (Agent)",
    receiptFileName: "march-rent-receipt.jpg",
  },
  {
    id: "2026-02",
    monthLabel: "February 2026",
    amount: "$1,200.00",
    dueDate: "Feb 5, 2026",
    status: "PAID",
    submittedDate: "Feb 3, 2026",
    paymentDate: "Feb 4, 2026",
    reviewedBy: "Sarah Chen (Owner)",
    receiptFileName: "february-rent-receipt.jpg",
  },
  {
    id: "2026-01",
    monthLabel: "January 2026",
    amount: "$1,200.00",
    dueDate: "Jan 5, 2026",
    status: "PAID",
    submittedDate: "Jan 2, 2026",
    paymentDate: "Jan 3, 2026",
    reviewedBy: "Sarah Chen (Owner)",
    receiptFileName: "january-rent-receipt.jpg",
  },
];

export interface SubmitPaymentInput {
  method: string;
  receiptFileName: string;
  note?: string;
}

interface TenantPaymentsContextValue {
  records: RentRecord[];
  getRecord: (id: string) => RentRecord | undefined;
  currentRecord: RentRecord | undefined; // most recent month — drives the dashboard
  submitPayment: (id: string, input: SubmitPaymentInput) => void;
}

const TenantPaymentsContext = createContext<TenantPaymentsContextValue | null>(null);

function todayLabel(): string {
  return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function TenantPaymentsProvider({ children }: { children: ReactNode }) {
  const [records, setRecords] = useState<RentRecord[]>(initialRecords);

  const getRecord = (id: string) => records.find((r) => r.id === id);
  const currentRecord = records[0];

  const submitPayment = (id: string, input: SubmitPaymentInput) => {
    setRecords((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status: "PENDING",
              submittedDate: todayLabel(),
              method: input.method,
              receiptFileName: input.receiptFileName,
              note: input.note,
            }
          : r,
      ),
    );
  };

  return (
    <TenantPaymentsContext.Provider value={{ records, getRecord, currentRecord, submitPayment }}>
      {children}
    </TenantPaymentsContext.Provider>
  );
}

export function useTenantPayments(): TenantPaymentsContextValue {
  const ctx = useContext(TenantPaymentsContext);
  if (!ctx) throw new Error("useTenantPayments must be used within TenantPaymentsProvider");
  return ctx;
}
