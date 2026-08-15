import { useState } from "react";
import { Link } from "react-router-dom";
import { UserPlus } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TenantCard } from "@/components/TenantCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { useOwnerAgents } from "@/lib/owner-agents-context";

const tenants = [
  { name: "Maria Lopez", unitLabel: "Sagewood 2B" },
  { name: "James Okoro", unitLabel: "Harbor View 5A", isUnitLeader: true },
  { name: "Priya Nair", unitLabel: "Willow Court 1" },
  { name: "Tom Becker", unitLabel: "Sagewood 4A" },
];

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

function AgentsTab() {
  const { agents, loading, error } = useOwnerAgents();

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (error) return <p className="text-sm text-status-overdue">{error}</p>;

  if (agents.length === 0) {
    return (
      <EmptyState
        icon={UserPlus}
        title="No agents yet"
        description="Agents you add can manage assigned properties and tenants for you."
        action={
          <Link to="/owner/agents/new">
            <Button size="sm">Add agent</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {agents.map((agent) => (
        <Link key={agent.id} to={`/owner/agents/${agent.id}`}>
          <Card className="flex items-center justify-between transition-colors hover:bg-sage-50/40">
            <div className="min-w-0">
              <p className="truncate font-medium text-ink">{agent.name}</p>
              <p className="truncate text-sm text-ink/60">
                {agent.assignments.length > 0
                  ? `${agent.assignments.length} assignment${agent.assignments.length === 1 ? "" : "s"}`
                  : "No assignments yet"}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
                statusClasses[agent.status],
              )}
            >
              {statusLabel[agent.status]}
            </span>
          </Card>
        </Link>
      ))}
    </div>
  );
}

export function OwnerPeople() {
  const [tab, setTab] = useState<"tenants" | "agents">("tenants");

  return (
    <>
      <PageHeader
        title="People"
        description="Agents, unit leaders, and tenants."
        action={
          <Link to={tab === "tenants" ? "/owner/people/new" : "/owner/agents/new"}>
            <Button size="sm">{tab === "tenants" ? "Add tenant" : "Add agent"}</Button>
          </Link>
        }
      />

      <div className="mb-5 inline-flex rounded-input bg-sage-50 p-1">
        {(["tenants", "agents"] as const).map((t) => (
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

      {tab === "tenants" ? (
        <div className="flex flex-col gap-3">
          {tenants.map((p) => (
            <TenantCard key={p.name} {...p} />
          ))}
        </div>
      ) : (
        <AgentsTab />
      )}
    </>
  );
}
