import { useEffect, useMemo, useState } from "react";
import { ArchiveRestore, MoveRight, ShieldAlert, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";

interface TenancyRow {
  tenantId: string;
  name: string;
  email: string;
  accountStatus: string;
  leaseId: string;
  leaseStatus: "ACTIVE" | "ENDED";
  startDate: string;
  endDate: string | null;
  moveOutDate: string | null;
  endReason: string | null;
  finalNotes: string | null;
  propertyId: string;
  propertyName: string;
  unitId: string;
  unitLabel: string;
}
interface AvailableUnit { propertyId: string; propertyName: string; unitId: string; unitLabel: string; monthlyRent: number }
interface Retention { retention_months: number; last_cleanup_at: string | null; last_records_cleaned: number; storage_cleanup_status: string }

export function OwnerTenantLifecycle() {
  const [tenancies, setTenancies] = useState<TenancyRow[]>([]);
  const [units, setUnits] = useState<AvailableUnit[]>([]);
  const [retention, setRetention] = useState<Retention | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TenancyRow | null>(null);
  const [mode, setMode] = useState<"end" | "move" | "delete" | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [life, keep] = await Promise.all([
        api.get<{ tenancies: TenancyRow[]; availableUnits: AvailableUnit[] }>("/api/owner/lifecycle"),
        api.get<{ retention: Retention }>("/api/owner/retention"),
      ]);
      setTenancies(life.tenancies);
      setUnits(life.availableUnits);
      setRetention(keep.retention);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load tenant lifecycle data.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);
  const current = useMemo(() => tenancies.filter((row) => row.leaseStatus === "ACTIVE"), [tenancies]);
  const history = useMemo(() => tenancies.filter((row) => row.leaseStatus === "ENDED"), [tenancies]);

  async function endTenancy(form: HTMLFormElement) {
    if (!selected) return;
    const data = new FormData(form);
    setSaving(true);
    try {
      await api.post(`/api/owner/tenancies/${selected.leaseId}/end`, { moveOutDate: data.get("moveOutDate"), reason: data.get("reason"), finalNotes: data.get("finalNotes") });
      setMode(null); setSelected(null); await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : "Couldn't end this tenancy."); }
    finally { setSaving(false); }
  }

  async function moveTenant(form: HTMLFormElement) {
    if (!selected) return;
    const data = new FormData(form);
    setSaving(true);
    try {
      await api.post(`/api/owner/tenants/${selected.tenantId}/move`, { unitId: data.get("unitId"), startDate: data.get("startDate"), dueDay: Number(data.get("dueDay") || 1), deposit: Number(data.get("deposit") || 0) });
      setMode(null); setSelected(null); await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : "Couldn't move this tenant."); }
    finally { setSaving(false); }
  }

  async function permanentDelete(form: HTMLFormElement) {
    if (!selected) return;
    const data = new FormData(form);
    setSaving(true);
    try {
      await api.post(`/api/owner/tenants/${selected.tenantId}/permanent-delete`, { confirm: data.get("confirm") });
      setMode(null); setSelected(null); await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : "Couldn't permanently delete this tenant."); }
    finally { setSaving(false); }
  }

  async function updateRetention(months: number) {
    setSaving(true);
    try { const data = await api.patch<{ retention: Retention }>("/api/owner/retention", { retentionMonths: months }); setRetention(data.retention); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Couldn't update retention settings."); }
    finally { setSaving(false); }
  }

  return (
    <>
      <PageHeader title="Tenant lifecycle" description="End, move, retain, and permanently remove tenant records safely." />
      {error && <p className="mb-4 rounded-input bg-status-overdue/10 p-3 text-sm text-status-overdue">{error}</p>}
      {loading ? <Skeleton className="h-48 w-full" /> : <>
        <Card className="mb-6">
          <div className="flex items-start gap-3"><ArchiveRestore className="mt-0.5 h-5 w-5 text-sage-700" /><div className="min-w-0 flex-1"><h2 className="font-semibold text-ink">Data retention</h2><p className="mt-1 text-sm text-ink/60">Ended tenancy records become eligible for automatic cleanup after the retention period. Active tenancy data is never removed by retention cleanup.</p><div className="mt-4 flex flex-wrap items-end gap-3"><Input label="Retention period (months)" type="number" min="1" max="60" value={retention?.retention_months ?? 12} onChange={(e) => setRetention((r) => r ? { ...r, retention_months: Number(e.target.value) } : r)} className="w-48" /><Button size="sm" onClick={() => void updateRetention(retention?.retention_months ?? 12)} loading={saving}>Save</Button></div><div className="mt-3 grid gap-2 text-xs text-ink/50 sm:grid-cols-3"><span>Last cleanup: {retention?.last_cleanup_at ? new Date(retention.last_cleanup_at).toLocaleString() : "Not run yet"}</span><span>Records cleaned: {retention?.last_records_cleaned ?? 0}</span><span>Storage cleanup: {retention?.storage_cleanup_status ?? "NOT_RUN"}</span></div></div></div>
        </Card>

        <Section title="Current tenants" rows={current} empty="No active tenancies." render={(row) => <TenancyCard row={row} onEnd={() => { setSelected(row); setMode("end"); }} onMove={() => { setSelected(row); setMode("move"); }} onDelete={() => { setSelected(row); setMode("delete"); }} />} />
        <div className="mt-7"><Section title="Tenancy history" rows={history} empty="No ended tenancies yet." render={(row) => <TenancyCard row={row} onDelete={() => { setSelected(row); setMode("delete"); }} />} /></div>
      </>}

      <Modal open={mode === "end"} onClose={() => setMode(null)} title="End tenancy">
        <form onSubmit={(e) => { e.preventDefault(); void endTenancy(e.currentTarget); }} className="space-y-3"><p className="text-sm text-ink/60">{selected?.name} · {selected?.propertyName} · {selected?.unitLabel}</p><Input name="moveOutDate" type="date" label="Move-out date" required defaultValue={new Date().toISOString().slice(0,10)} /><Input name="reason" label="Reason (optional)" /><Textarea name="finalNotes" label="Final notes (optional)" /><div className="rounded-input bg-status-waiting/10 p-3 text-sm text-ink">Ending the tenancy deactivates the Tenant account and invalidates existing sessions. Historical records remain during retention.</div><div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setMode(null)}>Cancel</Button><Button type="submit" loading={saving}>End tenancy</Button></div></form>
      </Modal>

      <Modal open={mode === "move"} onClose={() => setMode(null)} title="Move Tenant">
        <form onSubmit={(e) => { e.preventDefault(); void moveTenant(e.currentTarget); }} className="space-y-3"><p className="text-sm text-ink/60">The same Tenant account will be reused and the previous tenancy kept as history.</p><Select name="unitId" label="New property / unit" required defaultValue=""><option value="" disabled>Select unit</option>{units.filter((unit) => unit.unitId !== selected?.unitId).map((unit) => <option key={unit.unitId} value={unit.unitId}>{unit.propertyName} · {unit.unitLabel}</option>)}</Select><Input name="startDate" type="date" label="New tenancy start date" required defaultValue={new Date().toISOString().slice(0,10)} /><Input name="dueDay" type="number" min="1" max="31" label="Rent due day" defaultValue="1" /><Input name="deposit" type="number" min="0" step="0.01" label="New tenancy deposit (RM)" defaultValue="0" /><div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setMode(null)}>Cancel</Button><Button type="submit" loading={saving}>Move Tenant</Button></div></form>
      </Modal>

      <Modal open={mode === "delete"} onClose={() => setMode(null)} title="Delete Tenant permanently">
        <form onSubmit={(e) => { e.preventDefault(); void permanentDelete(e.currentTarget); }} className="space-y-3"><div className="flex gap-3 rounded-input bg-status-overdue/10 p-3"><ShieldAlert className="h-5 w-5 shrink-0 text-status-overdue" /><p className="text-sm text-ink">This cannot be undone. Active tenancies must be ended first. Eligible database records, sessions, receipts, documents and private storage objects will be removed.</p></div><Input name="confirm" label="Type DELETE to confirm" autoComplete="off" required /><div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setMode(null)}>Cancel</Button><Button type="submit" variant="danger" loading={saving} icon={<Trash2 className="h-4 w-4" />}>Delete permanently</Button></div></form>
      </Modal>
    </>
  );
}

function Section<T>({ title, rows, empty, render }: { title: string; rows: T[]; empty: string; render: (row: T) => React.ReactNode }) { return <section><h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-ink/50">{title}</h2>{rows.length ? <div className="grid gap-3 lg:grid-cols-2">{rows.map((row, index) => <div key={index}>{render(row)}</div>)}</div> : <p className="text-sm text-ink/50">{empty}</p>}</section>; }

function TenancyCard({ row, onEnd, onMove, onDelete }: { row: TenancyRow; onEnd?: () => void; onMove?: () => void; onDelete: () => void }) { return <Card><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-ink">{row.name}</p><p className="text-sm text-ink/60">{row.propertyName} · {row.unitLabel}</p><p className="mt-1 text-xs text-ink/45">{row.startDate} → {row.leaseStatus === "ACTIVE" ? "Current" : row.moveOutDate || row.endDate || "Ended"}</p></div><span className={row.leaseStatus === "ACTIVE" ? "rounded-full bg-status-confirmed/10 px-2 py-1 text-xs text-status-confirmed" : "rounded-full bg-midnight-100 px-2 py-1 text-xs text-midnight-600"}>{row.leaseStatus}</span></div><div className="mt-4 flex flex-wrap gap-2">{onMove && <Button size="sm" variant="secondary" onClick={onMove} icon={<MoveRight className="h-4 w-4" />}>Move</Button>}{onEnd && <Button size="sm" variant="secondary" onClick={onEnd}>End tenancy</Button>}<Button size="sm" variant="ghost" onClick={onDelete}>Permanent delete</Button></div></Card>; }
