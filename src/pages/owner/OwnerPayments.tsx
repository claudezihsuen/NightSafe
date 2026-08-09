import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { PaymentStatus } from "@/types";

const payments: { tenant: string; unit: string; amount: string; status: PaymentStatus }[] = [
  { tenant: "Maria Lopez", unit: "Sagewood 2B", amount: "$1,200", status: "PAYMENT_CONFIRMED" },
  { tenant: "James Okoro", unit: "Harbor View 5A", amount: "$1,450", status: "PENDING_REVIEW" },
  { tenant: "Priya Nair", unit: "Willow Court 1", amount: "$980", status: "OVERDUE" },
  { tenant: "Tom Becker", unit: "Sagewood 4A", amount: "$1,150", status: "WAITING_PAYMENT" },
];

export function OwnerPayments() {
  return (
    <>
      <PageHeader title="Payments" description="Rent payments across all properties." />
      <div className="flex flex-col gap-3">
        {payments.map((p) => (
          <Card key={p.tenant} className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-midnight-800">{p.tenant}</p>
              <p className="text-sm text-midnight-500/70">{p.unit}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-midnight-800">{p.amount}</span>
              <StatusBadge status={p.status} />
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
