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
  const [deleteBlocked, setDeleteBlocked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    return api
      .get<{ properties: OwnerProperty[] }>("/api/owner/properties")
      .then((data) => setProperties(data.properties))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load this property."));
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (properties === null && !error) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (error) return <p className="text-sm text-status-overdue">{error}</p>;

  const property = properties?.find((p) => p.id === id);
  if (!property || !id) return <Navigate to="/owner/properties" replace />;

  async function handleDelete() {
    setBusy(true);
    setDeleteBlocked(null);
    try {
      await api.delete(`/api/owner/properties/${id}`);
      navigate("/owner/properties");
    } catch (err) {
      setDeleteBlocked(err instanceof ApiError ? err.message : "Couldn't delete this property.");
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive() {
    setBusy(true);
    try {
      await api.post(`/api/owner/properties/${id}/archive`);
      navigate("/owner/properties");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't archive this property.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="animate-fade-in-up">
      <Link
        to="/owner/properties"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink/60 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Properties
      </Link>

      {editingProperty ? (
        <EditPropertyForm
          property={property}
          onDone={() => {
            setEditingProperty(false);
            refresh();
          }}
          onCancel={() => setEditingProperty(false)}
        />
      ) : (
        <>
          <PageHeader
            title={property.name}
            description={property.address}
            action={
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditingProperty(true)}>
                  Edit
                </Button>
                <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAddUnit((v) => !v)}>
                  Add unit
                </Button>
              </div>
            }
          />

          <div className="mb-5 flex gap-2">
            <Button variant="ghost" size="sm" icon={<Archive className="h-3.5 w-3.5" />} loading={busy} onClick={handleArchive}>
              Archive property
            </Button>
            <Button variant="ghost" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} loading={busy} onClick={handleDelete}>
              Delete property
            </Button>
          </div>

          {deleteBlocked && (
            <Card className="mb-5 border-status-overdue/20 bg-status-overdue/5">
              <p className="text-sm text-status-overdue">{deleteBlocked}</p>
              <p className="mt-1 text-xs text-ink/60">
                Use "Archive property" above instead — it hides this property from new activity without deleting its history.
              </p>
            </Card>
          )}
        </>
      )}

      {showAddUnit && (
        <AddUnitForm
          propertyId={id}
          onDone={() => {
            setShowAddUnit(false);
            refresh();
          }}
          onCancel={() => setShowAddUnit(false)}
        />
      )}

      <div className="flex flex-col gap-3">
        {property.units.length === 0 && !showAddUnit && (
          <p className="text-sm text-ink/50">No units yet. Add one to start assigning agents and tenants.</p>
        )}
        {property.units.map((u) => (
          <UnitRow key={u.id} unit={u} propertyId={id} onChanged={refresh} />
        ))}
      </div>
    </div>
  );
}

function EditPropertyForm({
  property,
  onDone,
  onCancel,
}: {
  property: OwnerProperty;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(property.name);
  const [address, setAddress] = useState(property.address);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!name.trim() || !address.trim()) {
      setError("Name and address are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.patch(`/api/owner/properties/${property.id}`, { name, address });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save those changes.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="mb-5 flex flex-col gap-3">
      <Input label="Property name" value={name} onChange={(e) => setName(e.target.value)} />
      <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
      {error && <p className="text-sm text-status-overdue">{error}</p>}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button className="flex-1" loading={submitting} onClick={handleSubmit}>
          Save changes
        </Button>
      </div>
    </Card>
  );
}

function AddUnitForm({
  propertyId,
  onDone,
  onCancel,
}: {
  propertyId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState("");
  const [monthlyRent, setMonthlyRent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!label.trim()) {
      setError("Unit label is required.");
      return;
    }
    if (!monthlyRent || Number(monthlyRent) < 0) {
      setError("Enter a valid monthly rent.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/api/owner/properties/${propertyId}/units`, {
        label,
        monthlyRentDollars: Number(monthlyRent),
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add that unit.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="mb-4 flex flex-col gap-3">
      <Input label="Unit label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="A-01" />
      <Input
        label="Monthly rent"
        type="number"
        min="0"
        step="0.01"
        value={monthlyRent}
        onChange={(e) => setMonthlyRent(e.target.value)}
        placeholder="1200"
      />
      {error && <p className="text-sm text-status-overdue">{error}</p>}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button className="flex-1" loading={submitting} onClick={handleSubmit}>
          Add unit
        </Button>
      </div>
    </Card>
  );
}

function UnitRow({ unit, propertyId, onChanged }: { unit: OwnerUnit; propertyId: string; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [managingLeader, setManagingLeader] = useState(false);
  const [deleteBlocked, setDeleteBlocked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { unitLeaders } = useOwnerUnitLeaders();
  const currentLeader = unitLeaders.find((l) => l.unitId === unit.id);

  async function handleArchive() {
    setBusy(true);
    setDeleteBlocked(null);
    try {
      await api.post(`/api/owner/units/${unit.id}/archive`);
      onChanged();
    } catch (err) {
      setDeleteBlocked(err instanceof ApiError ? err.message : "Couldn't archive this unit.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    setDeleteBlocked(null);
    try {
      await api.delete(`/api/owner/units/${unit.id}`);
      onChanged();
    } catch (err) {
      setDeleteBlocked(err instanceof ApiError ? err.message : "Couldn't delete this unit.");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <EditUnitForm
        unit={unit}
        onDone={() => {
          setEditing(false);
          onChanged();
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-input bg-sage-50">
            <DoorOpen className="h-5 w-5 text-sage-600" />
          </div>
          <div>
            <p className="font-medium text-ink">{unit.label}</p>
            <p className="text-sm text-ink/60">{formatCents(unit.monthly_rent)}/mo</p>
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setEditing(true)}
            aria-label="Edit unit"
            className="flex h-8 w-8 items-center justify-center rounded-input text-ink/40 hover:bg-sage-50 hover:text-ink"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={handleArchive}
            disabled={busy}
            aria-label="Archive unit"
            className="flex h-8 w-8 items-center justify-center rounded-input text-ink/40 hover:bg-sage-50 hover:text-ink"
          >
            <Archive className="h-4 w-4" />
          </button>
          <button
            onClick={handleDelete}
            disabled={busy}
            aria-label="Delete unit"
            className="flex h-8 w-8 items-center justify-center rounded-input text-ink/40 hover:bg-sage-50 hover:text-status-overdue"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {deleteBlocked && (
        <p className="mt-3 rounded-input bg-status-overdue/5 px-3 py-2 text-xs text-status-overdue">{deleteBlocked}</p>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <div className="flex items-center gap-2 text-sm">
          <UserCog className="h-4 w-4 text-ink/40" />
          {currentLeader ? (
            <span className="text-ink">
              {currentLeader.name} <span className="text-ink/50">— Unit Leader</span>
            </span>
          ) : (
            <span className="text-ink/50">No Unit Leader assigned</span>
          )}
        </div>
        <button
          onClick={() => setManagingLeader((v) => !v)}
          className="text-sm font-medium text-sage-700 hover:text-sage-800"
        >
          {currentLeader ? "Change" : "Assign"}
        </button>
      </div>

      {managingLeader && (
        <UnitLeaderManager
          propertyId={propertyId}
          unitId={unit.id}
          currentLeaderId={currentLeader?.id}
          onDone={() => setManagingLeader(false)}
        />
      )}
    </Card>
  );
}

function EditUnitForm({ unit, onDone, onCancel }: { unit: OwnerUnit; onDone: () => void; onCancel: () => void }) {
  const [label, setLabel] = useState(unit.label);
  const [monthlyRent, setMonthlyRent] = useState((unit.monthly_rent / 100).toString());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!label.trim()) {
      setError("Unit label is required.");
      return;
    }
    if (!monthlyRent || Number(monthlyRent) < 0) {
      setError("Enter a valid monthly rent.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.patch(`/api/owner/units/${unit.id}`, { label, monthlyRentDollars: Number(monthlyRent) });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save those changes.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <Input label="Unit label" value={label} onChange={(e) => setLabel(e.target.value)} />
      <Input
        label="Monthly rent"
        type="number"
        min="0"
        step="0.01"
        value={monthlyRent}
        onChange={(e) => setMonthlyRent(e.target.value)}
      />
      {error && <p className="text-sm text-status-overdue">{error}</p>}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button className="flex-1" loading={submitting} onClick={handleSubmit}>
          Save changes
        </Button>
      </div>
    </Card>
  );
}

function UnitLeaderManager({
  unitId,
  currentLeaderId,
  onDone,
}: {
  propertyId: string;
  unitId: string;
  currentLeaderId?: string;
  onDone: () => void;
}) {
  const { unitLeaders, createUnitLeader, reassignUnitLeader } = useOwnerUnitLeaders();
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [existingId, setExistingId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmPrompt, setConfirmPrompt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const otherLeaders = unitLeaders.filter((l) => l.id !== currentLeaderId);

  async function handleAssignExisting(confirmReplace = false) {
    if (!existingId) {
      setError("Select a unit leader.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setConfirmPrompt(null);
    try {
      await reassignUnitLeader(existingId, unitId, confirmReplace);
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConfirmPrompt(err.message);
      } else {
        setError(err instanceof ApiError ? err.message : "Couldn't assign that unit leader.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateNew(confirmReplace = false) {
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setConfirmPrompt(null);
    try {
      const data = await createUnitLeader({ name, email, phone: phone || undefined, unitId }, confirmReplace);
      setInviteLink(data.inviteLink);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConfirmPrompt(err.message);
      } else {
        setError(err instanceof ApiError ? err.message : "Couldn't create that unit leader.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (inviteLink) {
    return (
      <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
        <p className="text-sm text-ink">
          Unit leader created. Share this activation link with {name}:
        </p>
        <div className="flex items-center gap-2 rounded-input border border-border bg-white px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-sm text-ink/80">{inviteLink}</span>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(inviteLink)}
            className="shrink-0 text-xs font-medium text-sage-700 hover:text-sage-800"
          >
            Copy
          </button>
        </div>
        <Button size="sm" onClick={onDone}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
      <div className="inline-flex rounded-input bg-sage-50 p-1">
        {(["existing", "new"] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setError(null);
              setConfirmPrompt(null);
            }}
            className={`rounded-input px-3 py-1 text-xs font-medium transition-colors ${
              mode === m ? "bg-white text-ink shadow-subtle" : "text-ink/60"
            }`}
          >
            {m === "existing" ? "Existing unit leader" : "New unit leader"}
          </button>
        ))}
      </div>

      {mode === "existing" ? (
        <Select label="Unit leader" value={existingId} onChange={(e) => setExistingId(e.target.value)}>
          <option value="">Select a unit leader</option>
          {otherLeaders.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} {l.unitLabel ? `(currently: ${l.unitLabel})` : ""}
            </option>
          ))}
        </Select>
      ) : (
        <>
          <Input label="Full name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </>
      )}

      {confirmPrompt && (
        <div className="rounded-input bg-status-waiting/5 px-3 py-2">
          <p className="text-xs text-status-waiting">{confirmPrompt}</p>
          <Button
            size="sm"
            variant="danger"
            className="mt-2"
            loading={submitting}
            onClick={() => (mode === "existing" ? handleAssignExisting(true) : handleCreateNew(true))}
          >
            Confirm replace
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-status-overdue">{error}</p>}

      <div className="flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1" onClick={onDone} disabled={submitting}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="flex-1"
          loading={submitting}
          onClick={() => (mode === "existing" ? handleAssignExisting() : handleCreateNew())}
        >
          {mode === "existing" ? "Assign" : "Create & assign"}
        </Button>
      </div>
    </div>
  );
}
