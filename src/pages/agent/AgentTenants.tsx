import { Link } from "react-router-dom";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { TenantCard } from "@/components/TenantCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAgentData } from "@/lib/agent-context";

export function AgentTenants() {
  const { tenants, loading, error } = useAgentData();

  return (
    <>
      <PageHeader
        title="Tenants"
        description="Tenants within your assigned scope."
        action={
          <Link to="/agent/tenants/new">
            <Button size="sm">Add tenant</Button>
          </Link>
        }
      />

      {loading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {!loading && error && <p className="text-sm text-status-overdue">{error}</p>}

      {!loading && !error && tenants.length === 0 && (
        <EmptyState icon={Users} title="No tenants yet" description="Tenants you add will appear here." />
      )}

      {!loading && !error && tenants.length > 0 && (
        <div className="flex flex-col gap-3">
          {tenants.map((t) => (
            <Link key={t.id} to={`/agent/leases/${t.leaseId}/deposit`}>
              <TenantCard name={t.name} unitLabel={`${t.propertyName} · ${t.unitLabel}`} />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
