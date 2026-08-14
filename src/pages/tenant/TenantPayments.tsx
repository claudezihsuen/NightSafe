import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/ui/PageHeader";
import { RentMonthCard } from "@/components/RentMonthCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Wallet } from "lucide-react";
import { useTenantPayments } from "@/lib/tenant-payments-context";
import { formatCents, formatDate, formatMonth } from "@/lib/format";

export function TenantPayments() {
  const navigate = useNavigate();
  const { records, loading, error } = useTenantPayments();

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Payments" description="Your monthly rent history." />

      {loading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {!loading && error && <p className="text-sm text-status-overdue">{error}</p>}

      {!loading && !error && records.length === 0 && (
        <EmptyState icon={Wallet} title="No rent payments yet" description="Your rent history will appear here." />
      )}

      {!loading && !error && records.length > 0 && (
        <div className="flex flex-col gap-3">
          {records.map((r) => (
            <RentMonthCard
              key={r.id}
              monthLabel={formatMonth(r.month)}
              amount={formatCents(r.amountCents)}
              dueDate={formatDate(r.dueDate)}
              status={r.status}
              hasReceipt={Boolean(r.receiptKey)}
              onClick={() =>
                navigate(r.status === "WAITING_PAYMENT" ? `/tenant/payments/${r.id}/pay` : `/tenant/payments/${r.id}`)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
