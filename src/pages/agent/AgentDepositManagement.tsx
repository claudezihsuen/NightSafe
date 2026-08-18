import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, FileText, Lock, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { FileUploader } from "@/components/FileUploader";
import { api, ApiError, API_URL } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DEPOSIT_TYPE_PRESETS } from "@/types";
import type { DepositBreakdown, DepositItem } from "@/types";

const API_BASE = "/api/agent";

function SummaryRow({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-ink/60">{label}</span>
      <span className={cn("font-medium text-ink", emphasis && "text-base font-semibold")}>{value}</span>
    </div>
  );
}

export function AgentDepositManagement() {
  const { leaseId } = useParams<{ leaseId: string }>();
  const [data, setData] = useState<DepositBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddItem, setShowAddItem] = useState(false);
  const [showAddDeduction, setShowAddDeduction] = useState(false);
  const [showAddReturn, setShowAddReturn] = useState(false);
  const [payingItemId, setPayingItemId] = useState<string | null>(null);

  const refresh = () => {
    if (!leaseId) return;
    return api
      .get<DepositBreakdown>(`${API_BASE}/leases/${leaseId}/deposit`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load this deposit."));
  };

  useEffect(() => {
    setLoading(true);
    refresh()?.finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaseId]);

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (error || !data || !leaseId) {
    return <p className="text-sm text-status-overdue">{error ?? "Deposit not found."}</p>;
  }

  const { items, deductions, returns, summary } = data;
  const isFinalized = summary.depositStatus === "FINALIZED";
  const currency = items[0]?.currency ?? "MYR";

  async function handleFinalize() {
    try {
      await api.post(`${API_BASE}/leases/${leaseId}/deposit/finalize`);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't finalize this deposit.");
    }
  }

  async function handleDeleteItem(itemId: string) {
    try {
      await api.delete(`${API_BASE}/deposit-items/${itemId}`);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't remove that item.");
    }
  }

  async function handleDeleteDeduction(id: string) {
    try {
      await api.delete(`${API_BASE}/deposit-deductions/${id}`);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't remove that deduction.");
    }
  }

  return (
    <div className="animate-fade-in-up">
      <Link
        to="/agent/tenants"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink/60 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Tenants
      </Link>

      <PageHeader
        title="Deposit"
        description={isFinalized ? "Finalized — composition is locked." : "Draft — add items, then finalize."}
        action={
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
              isFinalized ? "bg-status-confirmed/10 text-status-confirmed" : "bg-status-waiting/10 text-status-waiting",
            )}
          >
            {isFinalized && <Lock className="h-3 w-3" />}
            {isFinalized ? "Finalized" : "Draft"}
          </span>
        }
      />

      <Card className="mb-4">
        <SummaryRow label="Total Deposit" value={formatMoney(summary.totalDeposit, currency)} emphasis />
        <SummaryRow label="Amount Paid" value={formatMoney(summary.totalPaid, currency)} />
        <SummaryRow label="Amount Held" value={formatMoney(summary.amountHeld, currency)} />
        <SummaryRow label="Amount Deducted" value={formatMoney(summary.totalDeducted, currency)} />
        <SummaryRow label="Amount Returned" value={formatMoney(summary.totalReturned, currency)} />
        <SummaryRow label="Remaining Refundable" value={formatMoney(summary.remainingRefundable, currency)} emphasis />
      </Card>

      {error && <p className="mb-3 text-sm text-status-overdue">{error}</p>}

      {/* Line items */}
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Deposit items</h2>
        {!isFinalized && (
          <button
            onClick={() => setShowAddItem((v) => !v)}
            className="inline-flex items-center gap-1 text-sm font-medium text-sage-700 hover:text-sage-800"
          >
            <Plus className="h-4 w-4" />
            Add item
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-col gap-3">
        {items.length === 0 && <p className="text-sm text-ink/50">No deposit items yet.</p>}
        {items.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            isFinalized={isFinalized}
            onDelete={() => handleDeleteItem(item.id)}
            onPay={() => setPayingItemId(item.id)}
            paying={payingItemId === item.id}
            onPaid={() => {
              setPayingItemId(null);
              refresh();
            }}
            onCancelPay={() => setPayingItemId(null)}
          />
        ))}
      </div>

      {showAddItem && !isFinalized && (
        <AddItemForm
          leaseId={leaseId}
          onDone={() => {
            setShowAddItem(false);
            refresh();
          }}
          onCancel={() => setShowAddItem(false)}
        />
      )}

      {!isFinalized && items.length > 0 && (
        <Button onClick={handleFinalize} className="mb-6 w-full">
          Finalize deposit
        </Button>
      )}

      {/* Deductions */}
      <div className="mb-2 mt-6 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Deductions</h2>
        <button
          onClick={() => setShowAddDeduction((v) => !v)}
          className="inline-flex items-center gap-1 text-sm font-medium text-sage-700 hover:text-sage-800"
        >
          <Plus className="h-4 w-4" />
          Add deduction
        </button>
      </div>

      <div className="mb-4 flex flex-col gap-3">
        {deductions.length === 0 && <p className="text-sm text-ink/50">No deductions recorded.</p>}
        {deductions.map((d) => (
          <Card key={d.id} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-ink">{d.name}</p>
              <p className="text-sm text-ink/60">{d.reason}</p>
              {d.description && <p className="mt-1 text-xs text-ink/50">{d.description}</p>}
              {d.receipt_key && (
                <a
                  href={`${API_URL}${API_BASE}/deposit-deductions/${d.id}/receipt`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-sage-700 hover:text-sage-800"
                >
                  <FileText className="h-3 w-3" />
                  View receipt
                </a>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="font-semibold text-status-overdue">-{formatMoney(d.amount, currency)}</span>
              <button
                onClick={() => handleDeleteDeduction(d.id)}
                aria-label="Remove deduction"
                className="text-ink/30 hover:text-status-overdue"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </Card>
        ))}
      </div>

      {showAddDeduction && (
        <DeductionForm
          leaseId={leaseId}
          items={items}
          onDone={() => {
            setShowAddDeduction(false);
            refresh();
          }}
          onCancel={() => setShowAddDeduction(false)}
        />
      )}

      {/* Returns */}
      <div className="mb-2 mt-6 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Refunds returned</h2>
        <button
          onClick={() => setShowAddReturn((v) => !v)}
          className="inline-flex items-center gap-1 text-sm font-medium text-sage-700 hover:text-sage-800"
        >
          <Plus className="h-4 w-4" />
          Record return
        </button>
      </div>

      <div className="mb-4 flex flex-col gap-3">
        {returns.length === 0 && <p className="text-sm text-ink/50">Nothing returned yet.</p>}
        {returns.map((r) => (
          <Card key={r.id} className="flex items-center justify-between">
            <div>
              <p className="font-medium text-ink">{formatMoney(r.amount, currency)}</p>
              <p className="text-sm text-ink/60">{r.returned_at}</p>
              {r.notes && <p className="text-xs text-ink/50">{r.notes}</p>}
            </div>
            <CheckCircle2 className="h-5 w-5 text-status-confirmed" />
          </Card>
        ))}
      </div>

      {showAddReturn && (
        <ReturnForm
          leaseId={leaseId}
          maxAmountCents={summary.amountHeld}
          currency={currency}
          onDone={() => {
            setShowAddReturn(false);
            refresh();
          }}
          onCancel={() => setShowAddReturn(false)}
        />
      )}
    </div>
  );
}

function ItemCard({
  item,
  isFinalized,
  onDelete,
  onPay,
  paying,
  onPaid,
  onCancelPay,
}: {
  item: DepositItem;
  isFinalized: boolean;
  onDelete: () => void;
  onPay: () => void;
  paying: boolean;
  onPaid: () => void;
  onCancelPay: () => void;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-ink">{item.name}</p>
            <span className="rounded-full bg-sage-50 px-2 py-0.5 text-xs text-sage-700">{item.type}</span>
            {!item.refundable && (
              <span className="rounded-full bg-status-overdue/10 px-2 py-0.5 text-xs text-status-overdue">
                Non-refundable
              </span>
            )}
          </div>
          {item.description && <p className="mt-1 text-sm text-ink/60">{item.description}</p>}
          <p className="mt-1 text-xs text-ink/50">
            {item.quantity} × {formatMoney(item.unit_amount, item.currency)}
          </p>
          {item.notes && <p className="mt-1 text-xs italic text-ink/40">Note: {item.notes}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className="font-semibold text-ink">{formatMoney(item.total_amount, item.currency)}</p>
          <p className="mt-0.5 text-xs text-ink/50">
            Paid {formatMoney(item.amountPaid, item.currency)} · {item.paymentStatus.replace("_", " ").toLowerCase()}
          </p>
        </div>
      </div>

      {!paying ? (
        <div className="mt-3 flex gap-2">
          {item.paymentStatus !== "FULLY_PAID" && (
            <Button variant="secondary" size="sm" onClick={onPay}>
              Record payment
            </Button>
          )}
          {!isFinalized && (
            <Button variant="ghost" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={onDelete}>
              Remove
            </Button>
          )}
        </div>
      ) : (
        <PaymentForm itemId={item.id} onDone={onPaid} onCancel={onCancelPay} />
      )}
    </Card>
  );
}

function PaymentForm({ itemId, onDone, onCancel }: { itemId: string; onDone: () => void; onCancel: () => void }) {
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!amount || Number(amount) <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const form = new FormData();
    form.set("amount", amount);
    form.set("paidAt", paidAt);
    if (method) form.set("method", method);
    if (receipt) form.set("receipt", receipt);
    try {
      await api.postForm(`${API_BASE}/deposit-items/${itemId}/payments`, form);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't record that payment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
      <div className="grid grid-cols-2 gap-3">
        <Input label="Amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Input label="Date paid" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
      </div>
      <Input label="Method (optional)" value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Bank transfer" />
      <FileUploader label="Receipt (optional)" onFileSelect={setReceipt} />
      {error && <p className="text-sm text-status-overdue">{error}</p>}
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" className="flex-1" loading={submitting} onClick={handleSubmit}>
          Save payment
        </Button>
      </div>
    </div>
  );
}

function AddItemForm({ leaseId, onDone, onCancel }: { leaseId: string; onDone: () => void; onCancel: () => void }) {
  const [type, setType] = useState<string>(DEPOSIT_TYPE_PRESETS[0]);
  const [customType, setCustomType] = useState("");
  const [name, setName] = useState(DEPOSIT_TYPE_PRESETS[0]);
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitAmount, setUnitAmount] = useState("");
  const [currency, setCurrency] = useState("MYR");
  const [refundable, setRefundable] = useState(true);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const effectiveType = type === "Other" ? customType : type;

  async function handleSubmit() {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!effectiveType.trim()) {
      setError("Type is required.");
      return;
    }
    if (!unitAmount || Number(unitAmount) < 0) {
      setError("Enter a valid unit amount.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`${API_BASE}/leases/${leaseId}/deposit/items`, {
        name,
        type: effectiveType,
        description: description || null,
        quantity: Number(quantity),
        unitAmountDollars: Number(unitAmount),
        currency,
        refundable,
        notes: notes || null,
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add that item.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="mb-4 flex flex-col gap-3">
      <Select
        label="Type"
        value={type}
        onChange={(e) => {
          setType(e.target.value);
          if (e.target.value !== "Other") setName(e.target.value);
        }}
      >
        {DEPOSIT_TYPE_PRESETS.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
        <option value="Other">Other custom type…</option>
      </Select>
      {type === "Other" && (
        <Input label="Custom type" value={customType} onChange={(e) => setCustomType(e.target.value)} />
      )}
      <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <Textarea label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="grid grid-cols-3 gap-3">
        <Input label="Quantity" type="number" min="0" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        <Input
          label="Unit amount"
          type="number"
          min="0"
          step="0.01"
          value={unitAmount}
          onChange={(e) => setUnitAmount(e.target.value)}
        />
        <Input label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
      </div>
      <label className="flex items-center gap-2.5 text-sm text-ink">
        <input
          type="checkbox"
          checked={refundable}
          onChange={(e) => setRefundable(e.target.checked)}
          className="h-4 w-4 rounded border-border text-sage-600 focus-visible:ring-2 focus-visible:ring-sage-500"
        />
        Refundable
      </label>
      <Textarea
        label="Internal notes (optional — not shown to tenant)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      {error && <p className="text-sm text-status-overdue">{error}</p>}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button className="flex-1" loading={submitting} onClick={handleSubmit}>
          Add item
        </Button>
      </div>
    </Card>
  );
}

function DeductionForm({
  leaseId,
  items,
  onDone,
  onCancel,
}: {
  leaseId: string;
  items: DepositItem[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [depositItemId, setDepositItemId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [receipt, setReceipt] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!name.trim() || !reason.trim() || !amount || Number(amount) <= 0) {
      setError("Name, reason, and a positive amount are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const form = new FormData();
    form.set("name", name);
    form.set("amount", amount);
    form.set("reason", reason);
    if (description) form.set("description", description);
    if (depositItemId) form.set("depositItemId", depositItemId);
    form.set("date", date);
    if (receipt) form.set("receipt", receipt);
    try {
      await api.postForm(`${API_BASE}/leases/${leaseId}/deposit/deductions`, form);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add that deduction.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="mb-4 flex flex-col gap-3">
      <Input label="Deduction name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Broken furniture" />
      <Input label="Amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      <Textarea label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
      <Select label="Related deposit item (optional)" value={depositItemId} onChange={(e) => setDepositItemId(e.target.value)}>
        <option value="">None</option>
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </Select>
      <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <FileUploader label="Supporting document (optional)" onFileSelect={setReceipt} />
      {error && <p className="text-sm text-status-overdue">{error}</p>}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="danger" className="flex-1" loading={submitting} onClick={handleSubmit}>
          Add deduction
        </Button>
      </div>
    </Card>
  );
}

function ReturnForm({
  leaseId,
  maxAmountCents,
  currency,
  onDone,
  onCancel,
}: {
  leaseId: string;
  maxAmountCents: number;
  currency: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(() => (maxAmountCents / 100).toString());
  const [returnedAt, setReturnedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!amount || Number(amount) <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`${API_BASE}/leases/${leaseId}/deposit/returns`, {
        amountDollars: Number(amount),
        returnedAt,
        notes: notes || null,
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't record that return.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="mb-4 flex flex-col gap-3">
      <p className="text-xs text-ink/50">Available to return: {formatMoney(maxAmountCents, currency)}</p>
      <Input label="Amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <Input label="Date" type="date" value={returnedAt} onChange={(e) => setReturnedAt(e.target.value)} />
      <Textarea label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      {error && <p className="text-sm text-status-overdue">{error}</p>}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button className="flex-1" loading={submitting} onClick={handleSubmit}>
          Record return
        </Button>
      </div>
    </Card>
  );
}
