import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/ui/PageHeader";
import { RentMonthCard } from "@/components/RentMonthCard";
import { useTenantPayments } from "@/lib/tenant-payments-context";

export function TenantPayments() {
  const navigate = useNavigate();
  const { records } = useTenantPayments();

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Payments" description="Your monthly rent history." />
      <div className="flex flex-col gap-3">
        {records.map((r) => (
          <RentMonthCard
            key={r.id}
            monthLabel={r.monthLabel}
            amount={r.amount}
            dueDate={r.dueDate}
            status={r.status}
            hasReceipt={Boolean(r.receiptFileName)}
            onClick={() =>
              navigate(r.status === "WAITING_PAYMENT" ? `/tenant/payments/${r.id}/pay` : `/tenant/payments/${r.id}`)
            }
          />
        ))}
      </div>
    </div>
  );
}
