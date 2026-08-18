import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, FileText, XCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useOwnerUtilities } from "@/lib/owner-utilities-context";
import { ApiError, API_URL } from "@/lib/api";
import { formatCents, formatMonth } from "@/lib/format";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-3 text-sm last:border-b-0">
      <span className="text-ink/60">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}

export function OwnerUtilityReview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getRecord, confirmUtility, rejectUtility, loading } = useOwnerUtilities();
  const record = id ? getRecord(id) : undefined;

  const [showRejectForm, setShowRejectForm] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState<"confirm" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<"confirmed" | "rejected" | null>(null);

  if (loading) return null;
  if (!record && !result) return <Navigate to="/owner/payments" replace />;

  async function handleConfirm() {
    if (!record) return;
    setError(null);
    setSubmitting("confirm");
    try {
      await confirmUtility(record.id);
      setResult("confirmed");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(null);
    }
  }

  async function handleReject() {
    if (!record) return;
    setError(null);
    setSubmitting("reject");
    try {
      await rejectUtility(record.id, reason || undefined);
      setResult("rejected");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(null);
    }
  }

  if (result) {
    const confirmed = result === "confirmed";
    return (
      <div className="animate-fade-in-up flex min-h-[60vh] flex-col items-center justify-center text-center">
        <div
          className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full ${
            confirmed ? "bg-status-confirmed/10" : "bg-status-overdue/10"
          }`}
        >
          {confirmed ? (
            <CheckCircle2 className="h-7 w-7 text-status-confirmed" />
          ) : (
            <XCircle className="h-7 w-7 text-status-overdue" />
          )}
        </div>
        <h1 className="text-lg font-semibold text-ink">
          {confirmed ? "Payment confirmed" : "Payment rejected"}
        </h1>
        <p className="mt-1.5 max-w-xs text-sm text-ink/60">
          {confirmed
            ? "The unit leader will see this payment as confirmed."
            : "The unit leader can resubmit this month's payment."}
        </p>
        <Button className="mt-6" onClick={() => navigate("/owner/payments")}>
          Back to payments
        </Button>
      </div>
    );
  }

  if (!record) return <Navigate to="/owner/payments" replace />;

  return (
    <div className="animate-fade-in-up">
      <Link
        to="/owner/payments"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink/60 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Payments
      </Link>

      <PageHeader
        title={record.type === "WATER" ? "Water" : "Electricity"}
        description={`${record.propertyName} · ${record.unitLabel}`}
        action={<StatusBadge status={record.status} />}
      />

      <Card className="mb-4">
        <Row label="Month" value={formatMonth(record.month)} />
        <Row label="Amount" value={formatCents(record.amountCents)} />
        {record.submittedAt && <Row label="Submitted" value={new Date(record.submittedAt).toLocaleDateString()} />}
      </Card>

      {record.receiptKey && (
        <Card className="mb-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-input bg-sage-50">
              <FileText className="h-5 w-5 text-sage-600" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">Uploaded receipt</p>
              <p className="text-xs text-ink/50">Submitted by unit leader</p>
            </div>
          </div>
          <a href={`${API_URL}/api/owner/utilities/${record.id}/receipt`} target="_blank" rel="noreferrer">
            <Button variant="secondary" size="sm">
              View
            </Button>
          </a>
        </Card>
      )}

      {error && <p className="mb-3 text-sm text-status-overdue">{error}</p>}

      {!showRejectForm ? (
        <div className="flex gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            icon={<XCircle className="h-4 w-4" />}
            onClick={() => setShowRejectForm(true)}
          >
            Reject
          </Button>
          <Button
            className="flex-1"
            icon={<CheckCircle2 className="h-4 w-4" />}
            loading={submitting === "confirm"}
            onClick={handleConfirm}
          >
            Confirm
          </Button>
        </div>
      ) : (
        <Card className="flex flex-col gap-3">
          <Textarea
            label="Reason (optional)"
            placeholder="Let the unit leader know why this was rejected"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setShowRejectForm(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              loading={submitting === "reject"}
              onClick={handleReject}
            >
              Confirm reject
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
