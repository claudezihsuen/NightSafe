import { PageHeader } from "@/components/ui/PageHeader";
import { PaymentCard } from "@/components/PaymentCard";
import { FileUploader } from "@/components/FileUploader";

export function UnitLeaderWater() {
  return (
    <>
      <PageHeader title="Water" description="Submit and track water payments." />
      <div className="flex flex-col gap-4">
        <PaymentCard title="This month" subtitle="Unit 2B" amount="$32.00" status="WAITING_PAYMENT" />
        <FileUploader label="Upload water receipt" hint="PNG, JPG or PDF, up to 10MB" />
      </div>
    </>
  );
}
