import { Building2, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { HeroCard } from "@/components/HeroCard";
import { StatCard } from "@/components/StatCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAgentData } from "@/lib/agent-context";

export function AgentDashboard() {
  const { properties, tenants, loading } = useAgentData();
  const unitCount = properties.reduce((sum, p) => sum + p.units.length, 0);

  return (
    <>
      <PageHeader title="Dashboard" description="Your assigned properties at a glance." />

      {loading ? (
        <Skeleton className="mb-6 h-40 w-full" />
      ) : (
        <HeroCard
          eyebrow="Your scope"
          title={`${tenants.length} tenant${tenants.length === 1 ? "" : "s"} across your assignments`}
          description={
            properties.length > 0
              ? `Across ${properties.map((p) => p.name).join(", ")}.`
              : "You haven't been assigned to any properties yet."
          }
          value={String(tenants.length)}
          valueLabel="tenants"
          icon={Users}
          className="mb-6"
        />
      )}

      {!loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard icon={Building2} label="Assigned properties" value={String(properties.length)} />
          <StatCard icon={Users} label="Assigned units" value={String(unitCount)} />
        </div>
      )}
    </>
  );
}
