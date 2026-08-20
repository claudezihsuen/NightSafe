import { useEffect, useState } from "react";
import { Download, FileText } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { api, ApiError, API_URL } from "@/lib/api";

interface Agreement {
  id: string;
  file_name: string;
  uploaded_at: string;
}

export function TenantAgreement() {
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ agreement: Agreement | null }>("/api/tenant/agreement")
      .then((data) => setAgreement(data.agreement))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load your agreement."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Agreement" description="Your rental agreement." />

      {loading && <Skeleton className="h-32 w-full" />}

      {!loading && error && <p className="text-sm text-status-overdue">{error}</p>}

      {!loading && !error && !agreement && (
        <EmptyState
          icon={FileText}
          title="No document uploaded yet"
          description="Your owner or agent hasn't uploaded a lease agreement yet."
        />
      )}

      {!loading && !error && agreement && (
        <>
          <Card>
            <div className="flex items-start gap-3.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-input bg-sage-50">
                <FileText className="h-6 w-6 text-sage-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{agreement.file_name}</p>
                <p className="mt-0.5 text-sm text-ink/60">
                  Uploaded {new Date(agreement.uploaded_at).toLocaleDateString()}
                </p>
              </div>
            </div>

            <a
              href={`${API_URL}/api/tenant/agreement/${agreement.id}/download`}
              target="_blank"
              rel="noreferrer"
              className="mt-5 block"
            >
              <Button className="w-full" icon={<Download className="h-4 w-4" />}>
                Download
              </Button>
            </a>
          </Card>

          <p className="mt-4 text-center text-xs text-ink/40">
            This agreement is managed by your owner or agent and can't be edited here.
          </p>
        </>
      )}
    </div>
  );
}
