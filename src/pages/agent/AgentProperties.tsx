import { PageHeader } from "@/components/ui/PageHeader";
import { PropertyCard } from "@/components/PropertyCard";

const properties = [
  { name: "Sagewood Residences", units: 8, address: "12 Fern Lane" },
  { name: "The Willow Court", units: 6, address: "9 Willow St" },
];

export function AgentProperties() {
  return (
    <>
      <PageHeader title="Properties" description="Properties assigned to you." />
      <div className="grid gap-4 sm:grid-cols-2">
        {properties.map((p) => (
          <PropertyCard key={p.name} {...p} />
        ))}
      </div>
    </>
  );
}
