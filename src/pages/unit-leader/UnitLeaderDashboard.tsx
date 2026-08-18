import { PageHeader } from "@/components/ui/PageHeader";
import { UnitCard } from "@/components/UnitCard";
import { PaymentCard } from "@/components/PaymentCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Home } from "lucide-react";
import { useUnitLeader } from "@/lib/unit-leader-context";
import { formatCents } from "@/lib/format";

function currentMonthValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function UnitLeaderDashboard() {
  const { unit, utilities, loading, error } = useUnitLeader();
  const month = currentMonthValue();
  const water = utilities.find((u) => u.type === "WATER" && u.month === month);
  const electricity = utilities.find((u) => u.type === "ELECTRICITY" && u.month === month);

  return (
    <>
      <PageHeader title="Dashboard" description="Your assigned unit." />

      {loading && <Skeleton className="mb-4 h-20 w-full" />}

      {!loading && error && <p className="text-sm text-status-overdue">{error}</p>}

      {!loading && !error && !unit && (
        <EmptyState icon={Home} title="No unit assigned yet" description="Your owner or agent will assign you to a unit." />
      )}

      {!loading && !error && unit && (
        <>
          <UnitCard unitLabel={unit.label} propertyName={unit.property_name} className="mb-4" />
          <div className="grid gap-3 sm:grid-cols-2">
            <PaymentCard
              title="Water"
              subtitle="This month"
              amount={water ? formatCents(water.amountCents) : "Not submitted"}
              status={water?.status ?? "WAITING_PAYMENT"}
            />
            <PaymentCard
              title="Electricity"
              subtitle="This month"
              amount={electricity ? formatCents(electricity.amountCents) : "Not submitted"}
              status={electricity?.status ?? "WAITING_PAYMENT"}
            />
          </div>
        </>
      )}
    </>
  );
}
