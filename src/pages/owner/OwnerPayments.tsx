import { useNavigate } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PaymentCard } from "@/components/PaymentCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useOwnerPayments } from "@/lib/owner-payments-context";
import { formatCents, formatMonth } from "@/lib/format";

export function OwnerPayments() {
  const navigate = useNavigate();
  const { records, loading, error } = useOwnerPayments();

  return (
    <>
      <PageHeader title="Payments" description="Rent payments awaiting your review." />

      {loading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {!loading && error && <p className="text-sm text-status-overdue">{error}</p>}

      {!loading && !error && records.length === 0 && (
        <EmptyState
          icon={CheckCircle2}
          title="Nothing to review"
          description="Submitted rent payments will show up here for you to confirm or reject."
        />
      )}

      {!loading && !error && records.length > 0 && (
        <div className="flex flex-col gap-3">
          {records.map((r) => (
            <PaymentCard
              key={r.id}
              title={r.tenantName}
              subtitle={`${r.propertyName} · ${r.unitLabel} · ${formatMonth(r.month)}`}
              amount={formatCents(r.amountCents)}
              status={r.status}
              onClick={() => navigate(`/owner/payments/${r.id}`)}
            />
          ))}
        </div>
      )}
    </>
  );
}
