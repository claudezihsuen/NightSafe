import { Download, FileText } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const agreement = {
  fileName: "sagewood-2b-lease-agreement.pdf",
  uploadedDate: "Jan 1, 2026",
  term: "12 months",
};

function downloadPlaceholder() {
  const content = `NightSafe — Lease Agreement\nUnit 2B, Sagewood Residences\nTerm: ${agreement.term}\nUploaded: ${agreement.uploadedDate}`;
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = agreement.fileName.replace(".pdf", ".txt");
  link.click();
  URL.revokeObjectURL(url);
}

export function TenantAgreement() {
  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Agreement" description="Your rental agreement." />

      <Card>
        <div className="flex items-start gap-3.5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-input bg-sage-50">
            <FileText className="h-6 w-6 text-sage-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-ink">{agreement.fileName}</p>
            <p className="mt-0.5 text-sm text-ink/60">
              Uploaded {agreement.uploadedDate} · {agreement.term} term
            </p>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <Button variant="secondary" className="flex-1" icon={<FileText className="h-4 w-4" />}>
            View
          </Button>
          <Button className="flex-1" icon={<Download className="h-4 w-4" />} onClick={downloadPlaceholder}>
            Download
          </Button>
        </div>
      </Card>

      <p className="mt-4 text-center text-xs text-ink/40">
        This agreement is managed by your owner or agent and can't be edited here.
      </p>
    </div>
  );
}
