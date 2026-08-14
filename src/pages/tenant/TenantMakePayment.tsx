import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FileUploader } from "@/components/FileUploader";
import { useTenantPayments } from "@/lib/tenant-payments-context";
import { ApiError } from "@/lib/api";
import { formatCents, formatDate, formatMonth } from "@/lib/format";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-3 text-sm last:border-b-0">
      <span className="text-ink/60">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}

export function TenantMakePayment() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getRecord, submitPayment, loading } = useTenantPayments();
  const record = id ? getRecord(id) : undefined;

  const [receipt, setReceipt] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (loading) return null;
  if (!record) return <Navigate to="/tenant/payments" replace />;

  if (submitted) {
    return (
      <div className="animate-fade-in-up flex min-h-[60vh] flex-col items-center justify-center text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-status-confirmed/10">
          <CheckCircle2 className="h-7 w-7 text-status-confirmed" />
        </div>
        <h1 className="text-lg font-semibold text-ink">Payment submitted</h1>
        <p className="mt-1.5 max-w-xs text-sm text-ink/60">
          Waiting for owner/agent confirmation. We'll notify you once it's reviewed.
        </p>
        <Button className="mt-6" onClick={() => navigate(`/tenant/payments/${record.id}`)}>
          View payment
        </Button>
      </div>
    );
  }

  // Only a month still awaiting the tenant can be submitted here.
  if (record.status !== "WAITING_PAYMENT") {
    return <Navigate to={`/tenant/payments/${record.id}`} replace />;
  }

  const handleSubmit = async () => {
    if (!receipt) {
      setError("Upload your payment receipt.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await submitPayment(record.id, receipt);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="animate-fade-in-up">
      <Link
        to="/tenant/payments"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink/60 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Payments
      </Link>

      <PageHeader title="Make a payment" description={formatMonth(record.month)} />

      <Card className="mb-4">
        <Row label="Month" value={formatMonth(record.month)} />
        <Row label="Rent amount" value={formatCents(record.amountCents)} />
        <Row label="Due date" value={formatDate(record.dueDate)} />
      </Card>

      <div className="flex flex-col gap-4">
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink/80">Receipt</p>
          <FileUploader onFileSelect={setReceipt} />
        </div>

        {error && <p className="text-sm text-status-overdue">{error}</p>}

        <Button onClick={handleSubmit} loading={submitting} className="w-full">
          Submit payment
        </Button>
      </div>
    </div>
  );
}
