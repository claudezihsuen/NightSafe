import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { TenantCard } from "@/components/TenantCard";

const tenants = [
  { name: "Maria Lopez", unitLabel: "Sagewood 2B" },
  { name: "Tom Becker", unitLabel: "Sagewood 4A" },
  { name: "Priya Nair", unitLabel: "Willow Court 1", isUnitLeader: true },
];

export function AgentTenants() {
  return (
    <>
      <PageHeader
        title="Tenants"
        description="Tenants within your assigned scope."
        action={<Button size="sm">Add tenant</Button>}
      />
      <div className="flex flex-col gap-3">
        {tenants.map((t) => (
          <TenantCard key={t.name} {...t} />
        ))}
      </div>
    </>
  );
}
