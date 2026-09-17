import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Archive, ArrowLeft, DoorOpen, Pencil, Plus, Trash2, UserCog } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { api, ApiError } from "@/lib/api";
import { formatCents } from "@/lib/format";
import { useOwnerUnitLeaders } from "@/lib/owner-unit-leaders-context";
import type { OwnerProperty, OwnerUnit } from "@/types";

export function OwnerPropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [properties, setProperties] = useState<OwnerProperty[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAddUnit, setShowAddUnit] = useState(false);
  const [editingProperty, setEditingProperty] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = () => api
    .get<{ properties: OwnerProperty[] }>("/api/owner/properties")
    .then((data) => setProperties(data.properties))
    .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load this property."));

  useEffect(() => { void refresh(); }, [id]);

  if (properties === null && !error) {
    return <div className="flex flex-col gap-3"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>;
  }
  if (error) return <p className="text-sm text-status-overdue">{error}</p>;
  const property = properties?.find((p) => p.id === id);
  if (!property || !id) return <Navigate to="/owner/properties" replace />;

  async function archiveProperty() {
    setBusy(true);
    try { await api.post(`/api/owner/properties/${id}/archive`); navigate("/owner/properties"); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Couldn't archive this property."); }
    finally { setBusy(false); }
  }

  async function deleteProperty() {
    if (!window.confirm("Delete this property? This only works when it has no protected history.")) return;
    setBusy(true);
    try { await api.delete(`/api/owner/properties/${id}`); navigate("/owner/properties"); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Couldn't delete this property."); }
    finally { setBusy(false); }
  }

  return <div className="animate-fade-in-up">
    <Link to="/owner/properties" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink/60 hover:text-ink"><ArrowLeft className="h-4 w-4" />Properties</Link>

    {editingProperty ? (
      <EditPropertyForm property={property} onDone={() => { setEditingProperty(false); void refresh(); }} onCancel={() => setEditingProperty(false)} />
    ) : <>
      <PageHeader title={property.name} description={property.address} action={<div className="flex gap-2">
        <Button variant="secondary" size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditingProperty(true)}>Edit</Button>
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAddUnit((v) => !v)}>Add unit</Button>
      </div>} />
      <div className="mb-5 flex gap-2">
        <Button variant="ghost" size="sm" icon={<Archive className="h-3.5 w-3.5" />} loading={busy} onClick={archiveProperty}>Archive property</Button>
        <Button variant="ghost" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} loading={busy} onClick={deleteProperty}>Delete property</Button>
      </div>
    </>}

    {showAddUnit && <AddUnitForm propertyId={id} onDone={() => { setShowAddUnit(false); void refresh(); }} onCancel={() => setShowAddUnit(false)} />}

    <div className="flex flex-col gap-3">
      {property.units.length === 0 && !showAddUnit && <p className="text-sm text-ink/50">No units yet. Add one to start assigning tenants.</p>}
      {property.units.map((unit) => <UnitRow key={unit.id} unit={unit} onChanged={refresh} />)}
    </div>
  </div>;
}

function EditPropertyForm({ property, onDone, onCancel }: { property: OwnerProperty; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState(property.name);
  const [address, setAddress] = useState(property.address);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  async function submit() {
    if (!name.trim() || !address.trim()) return setError("Name and address are required.");
    setSubmitting(true); setError(null);
    try { await api.patch(`/api/owner/properties/${property.id}`, { name, address }); onDone(); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Couldn't save those changes."); }
    finally { setSubmitting(false); }
  }
  return <Card className="mb-5 flex flex-col gap-3">
    <Input label="Property name" value={name} onChange={(e) => setName(e.target.value)} />
    <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
    {error && <p className="text-sm text-status-overdue">{error}</p>}
    <div className="flex gap-2"><Button variant="secondary" className="flex-1" onClick={onCancel}>Cancel</Button><Button className="flex-1" loading={submitting} onClick={submit}>Save changes</Button></div>
  </Card>;
}

function AddUnitForm({ propertyId, onDone, onCancel }: { propertyId: string; onDone: () => void; onCancel: () => void }) {
  const [label, setLabel] = useState("");
  const [monthlyRent, setMonthlyRent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  async function submit() {
    if (!label.trim()) return setError("Unit label is required.");
    if (!monthlyRent || Number(monthlyRent) < 0) return setError("Enter a valid monthly rent.");
    setSubmitting(true); setError(null);
    try { await api.post(`/api/owner/properties/${propertyId}/units`, { label, monthlyRentDollars: Number(monthlyRent) }); onDone(); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Couldn't add that unit."); }
    finally { setSubmitting(false); }
  }
  return <Card className="mb-4 flex flex-col gap-3">
    <Input label="Unit label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="A-01" />
    <Input label="Monthly rent" type="number" min="0" step="0.01" value={monthlyRent} onChange={(e) => setMonthlyRent(e.target.value)} />
    {error && <p className="text-sm text-status-overdue">{error}</p>}
    <div className="flex gap-2"><Button variant="secondary" className="flex-1" onClick={onCancel}>Cancel</Button><Button className="flex-1" loading={submitting} onClick={submit}>Add unit</Button></div>
  </Card>;
}

function UnitRow({ unit, onChanged }: { unit: OwnerUnit; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [managingLeader, setManagingLeader] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { unitLeaders } = useOwnerUnitLeaders();
  const currentLeader = unitLeaders.find((person) => person.isUnitLeader && person.unitId === unit.id);

  async function archiveUnit() {
    setBusy(true); setMessage(null);
    try { await api.post(`/api/owner/units/${unit.id}/archive`); onChanged(); }
    catch (err) { setMessage(err instanceof ApiError ? err.message : "Couldn't archive this unit."); }
    finally { setBusy(false); }
  }

  async function deleteUnit() {
    if (!window.confirm("Delete this unit? This only works when it has no protected history.")) return;
    setBusy(true); setMessage(null);
    try { await api.delete(`/api/owner/units/${unit.id}`); onChanged(); }
    catch (err) { setMessage(err instanceof ApiError ? err.message : "Couldn't delete this unit."); }
    finally { setBusy(false); }
  }

  if (editing) return <EditUnitForm unit={unit} onDone={() => { setEditing(false); onChanged(); }} onCancel={() => setEditing(false)} />;

  return <Card>
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-input bg-sage-50"><DoorOpen className="h-5 w-5 text-sage-600" /></div><div><p className="font-medium text-ink">{unit.label}</p><p className="text-sm text-ink/60">{formatCents(unit.monthly_rent)}/mo</p></div></div>
      <div className="flex gap-1">
        <button onClick={() => setEditing(true)} aria-label="Edit unit" className="flex h-8 w-8 items-center justify-center rounded-input text-ink/40 hover:bg-sage-50 hover:text-ink"><Pencil className="h-4 w-4" /></button>
        <button onClick={archiveUnit} disabled={busy} aria-label="Archive unit" className="flex h-8 w-8 items-center justify-center rounded-input text-ink/40 hover:bg-sage-50 hover:text-ink"><Archive className="h-4 w-4" /></button>
        <button onClick={deleteUnit} disabled={busy} aria-label="Delete unit" className="flex h-8 w-8 items-center justify-center rounded-input text-ink/40 hover:bg-sage-50 hover:text-status-overdue"><Trash2 className="h-4 w-4" /></button>
      </div>
    </div>
    {message && <p className="mt-3 rounded-input bg-status-overdue/5 px-3 py-2 text-xs text-status-overdue">{message}</p>}
    <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
      <div className="flex min-w-0 items-center gap-2 text-sm"><UserCog className="h-4 w-4 shrink-0 text-ink/40" />{currentLeader ? <span className="truncate text-ink">{currentLeader.name} <span className="text-ink/50">— Unit Leader</span></span> : <span className="text-ink/50">No Unit Leader assigned</span>}</div>
      <button onClick={() => setManagingLeader((v) => !v)} className="shrink-0 text-sm font-medium text-sage-700 hover:text-sage-800">{currentLeader ? "Change" : "Assign"}</button>
    </div>
    {managingLeader && <UnitLeaderManager unitId={unit.id} currentLeaderId={currentLeader?.id} onDone={() => setManagingLeader(false)} />}
  </Card>;
}

function EditUnitForm({ unit, onDone, onCancel }: { unit: OwnerUnit; onDone: () => void; onCancel: () => void }) {
  const [label, setLabel] = useState(unit.label);
  const [monthlyRent, setMonthlyRent] = useState((unit.monthly_rent / 100).toString());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  async function submit() {
    if (!label.trim() || Number(monthlyRent) < 0) return setError("Enter valid unit details.");
    setSubmitting(true); setError(null);
    try { await api.patch(`/api/owner/units/${unit.id}`, { label, monthlyRentDollars: Number(monthlyRent) }); onDone(); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Couldn't save those changes."); }
    finally { setSubmitting(false); }
  }
  return <Card className="flex flex-col gap-3"><Input label="Unit label" value={label} onChange={(e) => setLabel(e.target.value)} /><Input label="Monthly rent" type="number" min="0" step="0.01" value={monthlyRent} onChange={(e) => setMonthlyRent(e.target.value)} />{error && <p className="text-sm text-status-overdue">{error}</p>}<div className="flex gap-2"><Button variant="secondary" className="flex-1" onClick={onCancel}>Cancel</Button><Button className="flex-1" loading={submitting} onClick={submit}>Save changes</Button></div></Card>;
}

function UnitLeaderManager({ unitId, currentLeaderId, onDone }: { unitId: string; currentLeaderId?: string; onDone: () => void }) {
  const { unitLeaders, assignUnitLeader, unassignUnitLeader } = useOwnerUnitLeaders();
  const [tenantId, setTenantId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const eligible = unitLeaders.filter((person) => person.candidateUnitId === unitId || person.id === currentLeaderId);

  async function assign() {
    if (!tenantId) return setError("Select a tenant from this unit.");
    setSubmitting(true); setError(null);
    try { await assignUnitLeader(tenantId, unitId); onDone(); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Couldn't assign the Unit Leader."); }
    finally { setSubmitting(false); }
  }

  async function unassign() {
    if (!currentLeaderId) return;
    setSubmitting(true); setError(null);
    try { await unassignUnitLeader(currentLeaderId); onDone(); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Couldn't remove the Unit Leader role."); }
    finally { setSubmitting(false); }
  }

  return <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
    <div className="rounded-input bg-sage-50/60 px-3 py-2 text-xs text-ink/65">A Unit Leader is an existing tenant of this unit. They keep all normal tenant features and also manage water and electricity payments with receipt uploads.</div>
    <Select label="Tenant" value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
      <option value="">Select a tenant</option>
      {eligible.filter((person) => person.id !== currentLeaderId).map((person) => <option key={person.id} value={person.id}>{person.name} · {person.email}</option>)}
    </Select>
    {eligible.filter((person) => person.id !== currentLeaderId).length === 0 && <p className="text-xs text-ink/50">No other active tenant is available in this unit.</p>}
    {error && <p className="text-sm text-status-overdue">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" size="sm" className="flex-1" onClick={onDone} disabled={submitting}>Cancel</Button>
      {currentLeaderId && <Button variant="secondary" size="sm" className="flex-1" onClick={unassign} loading={submitting}>Remove role</Button>}
      <Button size="sm" className="flex-1" onClick={assign} loading={submitting} disabled={!tenantId}>Assign</Button>
    </div>
  </div>;
}
