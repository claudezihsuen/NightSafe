import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useTenantPayments } from "@/lib/tenant-payments-context";
import { formatCents, formatDate, formatMonth } from "@/lib/format";
import { API_URL } from "@/lib/api";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-3 text-sm last:border-b-0">
      <span className="text-ink/60">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}

export function TenantPaymentDetails() {
  const { id } = useParams<{ id: string }>();
  const { getRecord, loading } = useTenantPayments();
  const record = id ? getRecord(id) : undefined;

  if (loading) return null;
  if (!record) return <Navigate to="/tenant/payments" replace />;

  // A month still waiting on the tenant belongs in the payment flow, not this read-only view.
  if (record.status === "WAITING_PAYMENT") {
    return <Navigate to={`/tenant/payments/${record.id}/pay`} replace />;
  }

  return (
    <div className="animate-fade-in-up">
      <Link
        to="/tenant/payments"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink/60 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Payments
      </Link>

      <PageHeader
        title={formatMonth(record.month)}
        description="Rent payment details."
        action={<StatusBadge status={record.status} />}
      />

      <Card className="mb-4">
        <Row label="Amount" value={formatCents(record.amountCents)} />
        <Row label="Due date" value={formatDate(record.dueDate)} />
        {record.submittedAt && <Row label="Submitted" value={new Date(record.submittedAt).toLocaleDateString()} />}
        {record.paymentDate && <Row label="Payment date" value={new Date(record.paymentDate).toLocaleDateString()} />}
        {record.reviewedByName && <Row label="Reviewed by" value={record.reviewedByName} />}
      </Card>

      {record.receiptKey && (
        <Card className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-input bg-sage-50">
              <FileText className="h-5 w-5 text-sage-600" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">Uploaded receipt</p>
              <p className="text-xs text-ink/50">Submitted for review</p>
            </div>
          </div>
          <a href={`${API_URL}/api/tenant/payments/${record.id}/receipt`} target="_blank" rel="noreferrer">
            <Button variant="secondary" size="sm">
              View
            </Button>
          </a>
        </Card>
      )}
    </div>
  );
}
