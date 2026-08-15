import { Building2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PropertyCard } from "@/components/PropertyCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAgentData } from "@/lib/agent-context";

export function AgentProperties() {
  const { properties, loading, error } = useAgentData();

  return (
    <>
      <PageHeader title="Properties" description="Properties assigned to you." />

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {!loading && error && <p className="text-sm text-status-overdue">{error}</p>}

      {!loading && !error && properties.length === 0 && (
        <EmptyState icon={Building2} title="No assignments yet" description="Properties your owner assigns you will appear here." />
      )}

      {!loading && !error && properties.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {properties.map((p) => (
            <PropertyCard key={p.id} name={p.name} address={p.address} units={p.units.length} />
          ))}
        </div>
      )}
    </>
  );
}
