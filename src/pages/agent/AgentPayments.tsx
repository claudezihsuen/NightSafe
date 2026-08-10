import { PageHeader } from "@/components/ui/PageHeader";
import { PaymentCard } from "@/components/PaymentCard";
import type { PaymentStatus } from "@/types";

const payments: { tenant: string; unit: string; amount: string; status: PaymentStatus }[] = [
  { tenant: "Maria Lopez", unit: "Sagewood 2B", amount: "$1,200", status: "PAYMENT_CONFIRMED" },
  { tenant: "Tom Becker", unit: "Sagewood 4A", amount: "$1,150", status: "WAITING_PAYMENT" },
  { tenant: "Priya Nair", unit: "Willow Court 1", amount: "$980", status: "OVERDUE" },
];

export function AgentPayments() {
  return (
    <>
      <PageHeader title="Payments" description="Rent payments within your assigned scope." />
      <div className="flex flex-col gap-3">
        {payments.map((p) => (
          <PaymentCard key={p.tenant} title={p.tenant} subtitle={p.unit} amount={p.amount} status={p.status} />
        ))}
      </div>
    </>
  );
}
