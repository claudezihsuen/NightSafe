import { Wallet } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import type { PaymentStatus } from "@/types";

const history: { month: string; amount: string; status: PaymentStatus }[] = [
  { month: "August", amount: "$1,200.00", status: "WAITING_PAYMENT" },
  { month: "July", amount: "$1,200.00", status: "PAYMENT_CONFIRMED" },
  { month: "June", amount: "$1,200.00", status: "PAYMENT_CONFIRMED" },
];

export function TenantPayments() {
  return (
    <>
      <PageHeader
        title="Payments"
        description="Your rent payment history."
        action={<Button size="sm" icon={<Wallet className="h-4 w-4" />}>Upload receipt</Button>}
      />
      <div className="flex flex-col gap-3">
        {history.map((h) => (
          <Card key={h.month} className="flex items-center justify-between">
            <div>
              <p className="font-medium text-midnight-800">{h.month}</p>
              <p className="text-sm text-midnight-500/70">{h.amount}</p>
            </div>
            <StatusBadge status={h.status} />
          </Card>
        ))}
      </div>
    </>
  );
}
