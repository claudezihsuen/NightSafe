import { Droplets } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PaymentCard } from "@/components/PaymentCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useUnitLeader } from "@/lib/unit-leader-context";
import { formatCents, formatMonth } from "@/lib/format";

export function UnitLeaderHistory() {
  const { utilities, loading, error } = useUnitLeader();

  return (
    <>
      <PageHeader title="History" description="Past water and electricity payments." />

      {loading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {!loading && error && <p className="text-sm text-status-overdue">{error}</p>}

      {!loading && !error && utilities.length === 0 && (
        <EmptyState icon={Droplets} title="No payments yet" description="Water and electricity payments you submit will appear here." />
      )}

      {!loading && !error && utilities.length > 0 && (
        <div className="flex flex-col gap-3">
          {utilities.map((u) => (
            <PaymentCard
              key={u.id}
              title={u.type === "WATER" ? "Water" : "Electricity"}
              subtitle={formatMonth(u.month)}
              amount={formatCents(u.amountCents)}
              status={u.status}
            />
          ))}
        </div>
      )}
    </>
  );
}
