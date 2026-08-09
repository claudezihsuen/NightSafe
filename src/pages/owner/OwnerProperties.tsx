import { Building2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const properties = [
  { name: "Sagewood Residences", units: 8, address: "12 Fern Lane" },
  { name: "Harbor View Apartments", units: 12, address: "44 Dockside Ave" },
  { name: "The Willow Court", units: 6, address: "9 Willow St" },
];

export function OwnerProperties() {
  return (
    <>
      <PageHeader
        title="Properties"
        description="Every property you manage."
        action={<Button size="sm">Add property</Button>}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {properties.map((p) => (
          <Card key={p.name} className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-input bg-sage-50">
              <Building2 className="h-5 w-5 text-sage-600" />
            </div>
            <div>
              <p className="font-medium text-midnight-800">{p.name}</p>
              <p className="text-sm text-midnight-500/70">{p.address}</p>
              <p className="mt-1 text-xs text-midnight-500/60">{p.units} units</p>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
