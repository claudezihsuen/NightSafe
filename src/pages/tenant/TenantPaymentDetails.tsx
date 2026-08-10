import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText, XCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { RentStatusBadge } from "@/components/RentStatusBadge";
import { useTenantPayments } from "@/lib/tenant-payments-context";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-3 text-sm last:border-b-0">
      <span className="text-ink/60">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}

export function TenantPaymentDetails() {
  const { month } = useParams<{ month: string }>();
  const { getRecord } = useTenantPayments();
  const record = month ? getRecord(month) : undefined;

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
        title={record.monthLabel}
        description="Rent payment details."
        action={<RentStatusBadge status={record.status} />}
      />

      {record.status === "REJECTED" && record.rejectionReason && (
        <Card className="mb-4 flex items-start gap-3 border-status-overdue/20 bg-status-overdue/5">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-status-overdue" />
          <div>
            <p className="text-sm font-medium text-status-overdue">Payment rejected</p>
            <p className="mt-0.5 text-sm text-ink/70">{record.rejectionReason}</p>
          </div>
        </Card>
      )}

      <Card className="mb-4">
        <Row label="Amount" value={record.amount} />
        <Row label="Due date" value={record.dueDate} />
        {record.submittedDate && <Row label="Submitted" value={record.submittedDate} />}
        {record.paymentDate && <Row label="Payment date" value={record.paymentDate} />}
        {record.method && <Row label="Payment method" value={record.method} />}
        {record.reviewedBy && <Row label="Reviewed by" value={record.reviewedBy} />}
      </Card>

      {record.receiptFileName && (
        <Card className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-input bg-sage-50">
              <FileText className="h-5 w-5 text-sage-600" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{record.receiptFileName}</p>
              <p className="text-xs text-ink/50">Uploaded receipt</p>
            </div>
          </div>
          <Button variant="secondary" size="sm">
            View
          </Button>
        </Card>
      )}

      {record.status === "REJECTED" && (
        <Link to={`/tenant/payments/${record.id}/pay`} className="mt-4 block">
          <Button className="w-full">Resubmit payment</Button>
        </Link>
      )}
    </div>
  );
}
