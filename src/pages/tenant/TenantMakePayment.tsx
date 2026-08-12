import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { FileUploader } from "@/components/FileUploader";
import { useTenantPayments } from "@/lib/tenant-payments-context";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-3 text-sm last:border-b-0">
      <span className="text-ink/60">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}

export function TenantMakePayment() {
  const { month } = useParams<{ month: string }>();
  const navigate = useNavigate();
  const { getRecord, submitPayment } = useTenantPayments();
  const record = month ? getRecord(month) : undefined;

  const [method, setMethod] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

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

  // Only unpaid or rejected months can be (re)submitted; anything else belongs on the details page.
  if (record.status !== "WAITING_PAYMENT" && record.status !== "REJECTED") {
    return <Navigate to={`/tenant/payments/${record.id}`} replace />;
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!method) {
      setError("Select a payment method.");
      return;
    }
    if (!receipt) {
      setError("Upload your payment receipt.");
      return;
    }
    setError(null);
    submitPayment(record.id, { method, receiptFileName: receipt.name, note: note || undefined });
    setSubmitted(true);
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

      <PageHeader title="Make a payment" description={record.monthLabel} />

      <Card className="mb-4">
        <Row label="Month" value={record.monthLabel} />
        <Row label="Rent amount" value={record.amount} />
        <Row label="Due date" value={record.dueDate} />
      </Card>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Select label="Payment method" value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="">Select a method</option>
          <option value="Bank Transfer">Bank Transfer</option>
          <option value="Mobile Money">Mobile Money</option>
          <option value="Cash">Cash</option>
        </Select>

        <div>
          <p className="mb-1.5 text-sm font-medium text-ink/80">Receipt</p>
          <FileUploader onFileSelect={setReceipt} />
        </div>

        <Textarea
          label="Note (optional)"
          placeholder="Anything the owner or agent should know"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        {error && <p className="text-sm text-status-overdue">{error}</p>}

        <Button type="submit" className="mt-2 w-full">
          Submit payment
        </Button>
      </form>
    </div>
  );
}
