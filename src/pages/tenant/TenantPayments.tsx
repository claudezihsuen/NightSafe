import { PageHeader } from "@/components/ui/PageHeader";
import { PaymentCard } from "@/components/PaymentCard";
import { FileUploader } from "@/components/FileUploader";
import type { PaymentStatus } from "@/types";

const history: { month: string; amount: string; status: PaymentStatus }[] = [
  { month: "August", amount: "$1,200.00", status: "WAITING_PAYMENT" },
  { month: "July", amount: "$1,200.00", status: "PAYMENT_CONFIRMED" },
  { month: "June", amount: "$1,200.00", status: "PAYMENT_CONFIRMED" },
];

export function TenantPayments() {
  return (
    <>
      <PageHeader title="Payments" description="Your rent payment history." />
      <FileUploader label="Upload rent receipt" hint="PNG, JPG or PDF, up to 10MB" className="mb-5" />
      <div className="flex flex-col gap-3">
        {history.map((h) => (
          <PaymentCard key={h.month} title={h.month} subtitle="Rent" amount={h.amount} status={h.status} />
        ))}
      </div>
    </>
  );
}
