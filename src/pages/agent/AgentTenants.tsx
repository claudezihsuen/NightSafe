import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const tenants = [
  { name: "Maria Lopez", unit: "Sagewood 2B" },
  { name: "Tom Becker", unit: "Sagewood 4A" },
  { name: "Priya Nair", unit: "Willow Court 1" },
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
          <Card key={t.name} className="flex items-center justify-between">
            <div>
              <p className="font-medium text-midnight-800">{t.name}</p>
              <p className="text-sm text-midnight-500/70">{t.unit}</p>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
