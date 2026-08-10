import { PageHeader } from "@/components/ui/PageHeader";
import { UnitCard } from "@/components/UnitCard";
import { PaymentCard } from "@/components/PaymentCard";

export function UnitLeaderDashboard() {
  return (
    <>
      <PageHeader title="Dashboard" description="Your assigned unit." />
      <UnitCard unitLabel="Unit 2B" propertyName="Sagewood Residences" occupant="Maria Lopez" className="mb-4" />
      <div className="grid gap-3 sm:grid-cols-2">
        <PaymentCard title="Water" subtitle="This month" amount="$32.00" status="WAITING_PAYMENT" />
        <PaymentCard title="Electricity" subtitle="This month" amount="$54.00" status="PENDING_REVIEW" />
      </div>
    </>
  );
}
