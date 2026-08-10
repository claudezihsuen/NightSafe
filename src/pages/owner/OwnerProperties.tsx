import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { PropertyCard } from "@/components/PropertyCard";

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
          <PropertyCard key={p.name} {...p} />
        ))}
      </div>
    </>
  );
}
