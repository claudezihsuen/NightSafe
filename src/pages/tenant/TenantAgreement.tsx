import { FileText } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export function TenantAgreement() {
  return (
    <>
      <PageHeader title="Agreement" description="Your rental agreement." />
      <Card className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-input bg-sage-50">
            <FileText className="h-5 w-5 text-sage-600" />
          </div>
          <div>
            <p className="font-medium text-midnight-800">Lease agreement</p>
            <p className="text-sm text-midnight-500/70">Signed Jan 1, 2026 · 12 months</p>
          </div>
        </div>
        <Button variant="secondary" size="sm">
          View
        </Button>
      </Card>
    </>
  );
}
