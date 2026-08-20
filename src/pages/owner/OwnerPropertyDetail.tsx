import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, DoorOpen, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { api, ApiError } from "@/lib/api";
import { formatCents } from "@/lib/format";
import type { OwnerProperty } from "@/types";

export function OwnerPropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const [properties, setProperties] = useState<OwnerProperty[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAddUnit, setShowAddUnit] = useState(false);

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

  return (
    <div className="animate-fade-in-up">
      <Link
        to="/owner/properties"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink/60 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Properties
      </Link>

      <PageHeader
        title={property.name}
        description={property.address}
        action={
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAddUnit((v) => !v)}>
            Add unit
          </Button>
        }
      />

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
          <Card key={u.id} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-input bg-sage-50">
                <DoorOpen className="h-5 w-5 text-sage-600" />
              </div>
              <p className="font-medium text-ink">{u.label}</p>
            </div>
            <p className="text-sm text-ink/60">{formatCents(u.monthly_rent)}/mo</p>
          </Card>
        ))}
      </div>
    </div>
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
