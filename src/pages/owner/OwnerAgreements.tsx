import { FileText } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export function OwnerAgreements() {
  return (
    <>
      <PageHeader title="Agreements" description="Rental agreements across your properties." />
      <EmptyState
        icon={FileText}
        title="No agreements yet"
        description="Agreements created for tenants will appear here."
      />
    </>
  );
}
