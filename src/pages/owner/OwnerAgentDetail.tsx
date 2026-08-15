import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, Building2, Power, X } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useOwnerAgents } from "@/lib/owner-agents-context";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { OwnerProperty } from "@/types";

const statusLabel: Record<string, string> = {
  ACTIVE: "Active",
  WAITING_FOR_ACTIVATION: "Waiting for activation",
  INACTIVE: "Deactivated",
};

const statusClasses: Record<string, string> = {
  ACTIVE: "bg-status-confirmed/10 text-status-confirmed",
  WAITING_FOR_ACTIVATION: "bg-status-waiting/10 text-status-waiting",
  INACTIVE: "bg-status-overdue/10 text-status-overdue",
};

export function OwnerAgentDetail() {
  const { id } = useParams<{ id: string }>();
  const { getAgent, loading, activateAgent, deactivateAgent, createAssignment, removeAssignment } =
    useOwnerAgents();
  const agent = id ? getAgent(id) : undefined;

  const [properties, setProperties] = useState<OwnerProperty[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<{ properties: OwnerProperty[] }>("/api/owner/properties")
      .then((data) => setProperties(data.properties))
      .catch(() => setProperties([]));
  }, []);

  if (loading) return null;
  if (!agent || !id) return <Navigate to="/owner/people" replace />;

  const selectedProperty = properties.find((p) => p.id === propertyId);

  async function handleToggleStatus() {
    if (!agent) return;
    setBusy(true);
    setError(null);
    try {
      if (agent.status === "ACTIVE") {
        await deactivateAgent(agent.id);
      } else if (agent.status === "INACTIVE") {
        await activateAgent(agent.id);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddAssignment() {
    if (!propertyId) return;
    setBusy(true);
    setError(null);
    try {
      await createAssignment(id!, propertyId, unitId || undefined);
      setPropertyId("");
      setUnitId("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add that assignment.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveAssignment(assignmentId: string) {
    setBusy(true);
    setError(null);
    try {
      await removeAssignment(id!, assignmentId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't remove that assignment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="animate-fade-in-up">
      <Link
        to="/owner/people"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink/60 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        People
      </Link>

      <PageHeader
        title={agent.name}
        description={agent.email}
        action={
          <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", statusClasses[agent.status])}>
            {statusLabel[agent.status]}
          </span>
        }
      />

      {error && <p className="mb-3 text-sm text-status-overdue">{error}</p>}

      {agent.status !== "WAITING_FOR_ACTIVATION" && (
        <Button
          variant={agent.status === "ACTIVE" ? "danger" : "primary"}
          icon={<Power className="h-4 w-4" />}
          loading={busy}
          onClick={handleToggleStatus}
          className="mb-5"
        >
          {agent.status === "ACTIVE" ? "Deactivate agent" : "Reactivate agent"}
        </Button>
      )}

      <h2 className="mb-3 text-sm font-semibold text-ink">Assignments</h2>
      <div className="mb-5 flex flex-col gap-3">
        {agent.assignments.length === 0 && (
          <p className="text-sm text-ink/50">No properties or units assigned yet.</p>
        )}
        {agent.assignments.map((a) => (
          <Card key={a.id} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-input bg-sage-50">
                <Building2 className="h-[18px] w-[18px] text-sage-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-ink">{a.propertyName}</p>
                <p className="text-xs text-ink/50">{a.unitLabel ?? "Whole property"}</p>
              </div>
            </div>
            <button
              onClick={() => handleRemoveAssignment(a.id)}
              disabled={busy}
              aria-label="Remove assignment"
              className="flex h-8 w-8 items-center justify-center rounded-input text-ink/40 hover:bg-sage-50 hover:text-status-overdue"
            >
              <X className="h-4 w-4" />
            </button>
          </Card>
        ))}
      </div>

      <Card className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-ink">Add assignment</h3>
        <Select
          label="Property"
          value={propertyId}
          onChange={(e) => {
            setPropertyId(e.target.value);
            setUnitId("");
          }}
        >
          <option value="">Select a property</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select
          label="Unit (optional — leave blank for the whole property)"
          value={unitId}
          onChange={(e) => setUnitId(e.target.value)}
          disabled={!propertyId}
        >
          <option value="">Whole property</option>
          {selectedProperty?.units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </Select>
        <Button onClick={handleAddAssignment} loading={busy} disabled={!propertyId}>
          Add assignment
        </Button>
      </Card>
    </div>
  );
}
