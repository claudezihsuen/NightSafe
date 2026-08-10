import { PageHeader } from "@/components/ui/PageHeader";
import { PaymentCard } from "@/components/PaymentCard";
import { FileUploader } from "@/components/FileUploader";

export function UnitLeaderElectricity() {
  return (
    <>
      <PageHeader title="Electricity" description="Submit and track electricity payments." />
      <div className="flex flex-col gap-4">
        <PaymentCard title="This month" subtitle="Unit 2B" amount="$54.00" status="PENDING_REVIEW" />
        <FileUploader label="Upload electricity receipt" hint="PNG, JPG or PDF, up to 10MB" />
      </div>
    </>
  );
}
