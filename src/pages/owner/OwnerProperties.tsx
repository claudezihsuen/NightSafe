import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { PropertyCard } from "@/components/PropertyCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { api, ApiError } from "@/lib/api";
import type { OwnerProperty } from "@/types";

export function OwnerProperties() {
  const navigate = useNavigate();
  const [properties, setProperties] = useState<OwnerProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const refresh = () => {
    return api
      .get<{ properties: OwnerProperty[] }>("/api/owner/properties")
      .then((data) => setProperties(data.properties))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load your properties."));
  };

  useEffect(() => {
    refresh().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <PageHeader
        title="Properties"
        description="Every property you manage."
        action={
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAddForm((v) => !v)}>
            Add property
          </Button>
        }
      />

      {showAddForm && (
        <AddPropertyForm
          onDone={() => {
            setShowAddForm(false);
            refresh();
          }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {!loading && error && <p className="text-sm text-status-overdue">{error}</p>}

      {!loading && !error && properties.length === 0 && !showAddForm && (
        <EmptyState
          icon={Building2}
          title="No properties yet"
          description="Add your first property to start creating units and tenants."
          action={
            <Button size="sm" onClick={() => setShowAddForm(true)}>
              Add property
            </Button>
          }
        />
      )}

      {!loading && !error && properties.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {properties.map((p) => (
            <PropertyCard
              key={p.id}
              name={p.name}
              address={p.address}
              units={p.units.length}
              onClick={() => navigate(`/owner/properties/${p.id}`)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function AddPropertyForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
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
      await api.post("/api/owner/properties", { name, address });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add that property.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="mb-4 flex flex-col gap-3">
      <Input label="Property name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sagewood Residences" />
      <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="12 Fern Lane" />
      {error && <p className="text-sm text-status-overdue">{error}</p>}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button className="flex-1" loading={submitting} onClick={handleSubmit}>
          Add property
        </Button>
      </div>
    </Card>
  );
}
