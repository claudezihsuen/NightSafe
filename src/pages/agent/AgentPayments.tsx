import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { PaymentStatus } from "@/types";

const payments: { tenant: string; unit: string; status: PaymentStatus }[] = [
  { tenant: "Maria Lopez", unit: "Sagewood 2B", status: "PAYMENT_CONFIRMED" },
  { tenant: "Tom Becker", unit: "Sagewood 4A", status: "WAITING_PAYMENT" },
  { tenant: "Priya Nair", unit: "Willow Court 1", status: "OVERDUE" },
];

export function AgentPayments() {
  return (
    <>
      <PageHeader title="Payments" description="Rent payments within your assigned scope." />
      <div className="flex flex-col gap-3">
        {payments.map((p) => (
          <Card key={p.tenant} className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-midnight-800">{p.tenant}</p>
              <p className="text-sm text-midnight-500/70">{p.unit}</p>
            </div>
            <StatusBadge status={p.status} />
          </Card>
        ))}
      </div>
    </>
  );
}
