import { useEffect, useState } from "react";
import { FileText, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { api, ApiError, API_URL } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DepositBreakdown } from "@/types";

const paymentStatusLabel: Record<string, string> = {
  EXPECTED: "Expected",
  PARTIALLY_PAID: "Partially paid",
  FULLY_PAID: "Fully paid",
};

const refundStatusLabel: Record<string, string> = {
  NOT_APPLICABLE: "Not applicable",
  HELD: "Held",
  PARTIALLY_RETURNED: "Partially returned",
  FULLY_RETURNED: "Fully returned",
};

function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <span className={cn("text-ink/60", emphasis && "font-medium text-ink")}>{label}</span>
      <span className={cn("font-medium text-ink", emphasis && "text-base font-semibold")}>{value}</span>
    </div>
  );
}

export function TenantDeposit() {
  const [data, setData] = useState<DepositBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DepositBreakdown>("/api/tenant/deposit")
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load your deposit."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="animate-fade-in-up">
        <PageHeader title="Deposit" description="Your deposit breakdown." />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="animate-fade-in-up">
        <PageHeader title="Deposit" description="Your deposit breakdown." />
        <p className="text-sm text-status-overdue">{error ?? "Couldn't load your deposit."}</p>
      </div>
    );
  }

  const { items, deductions, summary } = data;
  const currency = items[0]?.currency ?? "MYR";

  if (items.length === 0) {
    return (
      <div className="animate-fade-in-up">
        <PageHeader title="Deposit" description="Your deposit breakdown." />
        <EmptyState
          icon={ShieldCheck}
          title="No deposit set up yet"
          description="Your owner or agent hasn't added deposit details yet."
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Deposit" description="Your deposit breakdown." />

      <Card className="mb-4">
        {items.map((item) => (
          <div key={item.id} className="border-b border-border py-3 last:border-b-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-ink">
                  {item.name}
                  {item.quantity !== 1 && <span className="text-ink/50"> — {item.quantity} months</span>}
                </p>
                {item.description && <p className="mt-0.5 text-sm text-ink/60">{item.description}</p>}
                {!item.refundable && (
                  <span className="mt-1 inline-block rounded-full bg-status-overdue/10 px-2 py-0.5 text-xs text-status-overdue">
                    Non-refundable
                  </span>
                )}
              </div>
              <p className="shrink-0 font-semibold text-ink">{formatMoney(item.total_amount, item.currency)}</p>
            </div>
          </div>
        ))}
        <div className="mt-1 border-t border-border pt-3">
          <Row label="Total Deposit" value={formatMoney(summary.totalDeposit, currency)} emphasis />
        </div>
      </Card>

      <Card className="mb-4">
        <h2 className="mb-1 text-sm font-semibold text-ink">Status</h2>
        <Row label="Deposit status" value={summary.depositStatus === "FINALIZED" ? "Finalized" : "Draft"} />
        <Row label="Payment status" value={paymentStatusLabel[summary.paymentStatus]} />
        <Row label="Refund status" value={refundStatusLabel[summary.refundStatus]} />
      </Card>

      {deductions.length > 0 && (
        <Card className="mb-4">
          <h2 className="mb-2 text-sm font-semibold text-ink">Deductions</h2>
          {deductions.map((d) => (
            <div
              key={d.id}
              className="flex items-start justify-between gap-3 border-b border-border py-2.5 last:border-b-0"
            >
              <div>
                <p className="text-sm font-medium text-ink">{d.name}</p>
                <p className="text-xs text-ink/60">{d.reason}</p>
                {d.receipt_key && (
                  <a
                    href={`${API_URL}/api/tenant/deposit/deductions/${d.id}/receipt`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-sage-700 hover:text-sage-800"
                  >
                    <FileText className="h-3 w-3" />
                    View document
                  </a>
                )}
              </div>
              <span className="shrink-0 font-medium text-status-overdue">-{formatMoney(d.amount, currency)}</span>
            </div>
          ))}
          <div className="mt-2 border-t border-border pt-3">
            <Row label="Total Deposit" value={formatMoney(summary.totalDeposit, currency)} />
            <Row label="Total Deductions" value={`-${formatMoney(summary.totalDeducted, currency)}`} />
            <Row label="Final Refund" value={formatMoney(summary.remainingRefundable, currency)} emphasis />
          </div>
        </Card>
      )}
    </div>
  );
}
