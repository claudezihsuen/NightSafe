import { useEffect, useState } from "react";
import { Download, FileText } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { API_URL, api, ApiError } from "@/lib/api";

interface Agreement {
  id: string;
  lease_id: string;
  file_name: string;
  uploaded_at: string;
  tenant_id: string;
  tenant_name: string;
  tenant_email: string;
  property_id: string;
  property_name: string;
  unit_id: string;
  unit_label: string;
}

export function OwnerAgreements() {
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    api
      .get<{ agreements: Agreement[] }>("/api/owner/agreements")
      .then((data) => {
        if (!cancelled) setAgreements(data.agreements);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Couldn't load agreements.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Agreements" description="Rental agreements across your properties." />

      {loading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {!loading && error && <p className="text-sm text-status-overdue">{error}</p>}

      {!loading && !error && agreements.length === 0 && (
        <EmptyState
          icon={FileText}
          title="No agreements yet"
          description="Agreements uploaded for tenants will appear here."
        />
      )}

      {!loading && !error && agreements.length > 0 && (
        <div className="flex flex-col gap-3">
          {agreements.map((agreement) => (
            <div
              key={agreement.id}
              className="flex flex-col gap-4 rounded-card border border-border bg-white p-4 shadow-subtle sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sage-50">
                  <FileText className="h-5 w-5 text-sage-600" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{agreement.file_name}</p>
                  <p className="mt-0.5 text-sm text-ink/60">
                    {agreement.tenant_name} · {agreement.property_name} · Unit {agreement.unit_label}
                  </p>
                  <p className="mt-1 text-xs text-ink/45">
                    Uploaded {new Date(agreement.uploaded_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <a
                href={`${API_URL}/api/owner/agreements/${encodeURIComponent(agreement.id)}/download`}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-input border border-border bg-white px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-sage-50"
              >
                <Download className="h-4 w-4" />
                Download
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
