import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FileUploader } from "@/components/FileUploader";
import { useUnitLeader } from "@/lib/unit-leader-context";
import { ApiError } from "@/lib/api";
import { formatCents, formatMonth } from "@/lib/format";
import type { UtilityType } from "@/types";

function currentMonthValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

interface UnitLeaderUtilityPageProps {
  type: UtilityType;
  title: string;
  description: string;
}

export function UnitLeaderUtilityPage({ type, title, description }: UnitLeaderUtilityPageProps) {
  const { utilities, loading, submitUtility } = useUnitLeader();

  const [month, setMonth] = useState(currentMonthValue());
  const [amount, setAmount] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const existing = utilities.find((u) => u.type === type && u.month === month);
  const canSubmit = !existing || existing.status === "WAITING_PAYMENT";

  async function handleSubmit() {
    if (!amount || Number(amount) <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (!receipt) {
      setError("Upload your receipt.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await submitUtility(type, month, amount, receipt);
      setAmount("");
      setReceipt(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="animate-fade-in-up">
      <PageHeader title={title} description={description} />

      <Card className="mb-4 flex flex-col gap-3">
        <Input
          label="Month"
          type="month"
          value={month}
          onChange={(e) => {
            setMonth(e.target.value);
            setError(null);
          }}
        />
        {existing && (
          <div className="flex items-center justify-between rounded-input bg-sage-50/60 px-3.5 py-2.5">
            <span className="text-sm text-ink/70">{formatMonth(month)}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-ink">{formatCents(existing.amountCents)}</span>
              <StatusBadge status={existing.status} />
            </div>
          </div>
        )}
      </Card>

      {!loading && canSubmit && (
        <div className="flex flex-col gap-4">
          <Input
            label="Amount"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink/80">Receipt</p>
            <FileUploader onFileSelect={setReceipt} />
          </div>
          {error && <p className="text-sm text-status-overdue">{error}</p>}
          <Button onClick={handleSubmit} loading={submitting} className="w-full">
            Submit {title.toLowerCase()} payment
          </Button>
        </div>
      )}

      {!loading && existing && !canSubmit && (
        <p className="text-center text-sm text-ink/50">
          {existing.status === "PENDING_REVIEW"
            ? "Waiting for owner/agent confirmation."
            : "This payment has been confirmed."}
        </p>
      )}
    </div>
  );
}
