import { Droplets, Zap } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { PaymentStatus, UtilityType } from "@/types";

const history: { type: UtilityType; month: string; amount: string; status: PaymentStatus }[] = [
  { type: "WATER", month: "July", amount: "$30.00", status: "PAYMENT_CONFIRMED" },
  { type: "ELECTRICITY", month: "July", amount: "$49.00", status: "PAYMENT_CONFIRMED" },
  { type: "WATER", month: "June", amount: "$28.00", status: "PAYMENT_CONFIRMED" },
];

export function UnitLeaderHistory() {
  return (
    <>
      <PageHeader title="History" description="Past water and electricity payments." />
      <div className="flex flex-col gap-3">
        {history.map((h, i) => (
          <Card key={i} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-input bg-sage-50">
                {h.type === "WATER" ? (
                  <Droplets className="h-[18px] w-[18px] text-sage-600" />
                ) : (
                  <Zap className="h-[18px] w-[18px] text-sage-600" />
                )}
              </div>
              <div>
                <p className="font-medium text-midnight-800">
                  {h.type === "WATER" ? "Water" : "Electricity"} — {h.month}
                </p>
                <p className="text-sm text-midnight-500/70">{h.amount}</p>
              </div>
            </div>
            <StatusBadge status={h.status} />
          </Card>
        ))}
      </div>
    </>
  );
}
