import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PaymentCard } from "@/components/PaymentCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAgentPayments } from "@/lib/agent-payments-context";
import { useAgentUtilities } from "@/lib/agent-utilities-context";
import { formatCents, formatMonth } from "@/lib/format";
import { cn } from "@/lib/utils";

function RentTab() {
  const navigate = useNavigate();
  const { records, loading, error } = useAgentPayments();

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }
  if (error) return <p className="text-sm text-status-overdue">{error}</p>;
  if (records.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Nothing to review"
        description="Submitted rent payments on your assigned units will show up here."
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {records.map((r) => (
        <PaymentCard
          key={r.id}
          title={r.tenantName}
          subtitle={`${r.propertyName} · ${r.unitLabel} · ${formatMonth(r.month)}`}
          amount={formatCents(r.amountCents)}
          status={r.status}
          onClick={() => navigate(`/agent/payments/${r.id}`)}
        />
      ))}
    </div>
  );
}

function UtilitiesTab() {
  const navigate = useNavigate();
  const { records, loading, error } = useAgentUtilities();

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }
  if (error) return <p className="text-sm text-status-overdue">{error}</p>;
  if (records.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Nothing to review"
        description="Submitted water and electricity payments on your assigned units will show up here."
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {records.map((r) => (
        <PaymentCard
          key={r.id}
          title={r.type === "WATER" ? "Water" : "Electricity"}
          subtitle={`${r.propertyName} · ${r.unitLabel} · ${formatMonth(r.month)}`}
          amount={formatCents(r.amountCents)}
          status={r.status}
          onClick={() => navigate(`/agent/utilities/${r.id}`)}
        />
      ))}
    </div>
  );
}

export function AgentPayments() {
  const [tab, setTab] = useState<"rent" | "utilities">("rent");

  return (
    <>
      <PageHeader title="Payments" description="Rent and utility payments awaiting your review." />

      <div className="mb-5 inline-flex rounded-input bg-sage-50 p-1">
        {(["rent", "utilities"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-input px-4 py-1.5 text-sm font-medium capitalize transition-colors",
              tab === t ? "bg-white text-ink shadow-subtle" : "text-ink/60",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "rent" ? <RentTab /> : <UtilitiesTab />}
    </>
  );
}
