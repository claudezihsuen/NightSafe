import { PageHeader } from "@/components/ui/PageHeader";
import { PaymentCard } from "@/components/PaymentCard";
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
          <PaymentCard
            key={i}
            title={h.type === "WATER" ? "Water" : "Electricity"}
            subtitle={h.month}
            amount={h.amount}
            status={h.status}
          />
        ))}
      </div>
    </>
  );
}
