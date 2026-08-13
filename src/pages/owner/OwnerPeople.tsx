import { Link } from "react-router-dom";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { TenantCard } from "@/components/TenantCard";

const people = [
  { name: "Maria Lopez", unitLabel: "Sagewood 2B" },
  { name: "James Okoro", unitLabel: "Harbor View 5A", isUnitLeader: true },
  { name: "Priya Nair", unitLabel: "Willow Court 1" },
  { name: "Tom Becker", unitLabel: "Sagewood 4A" },
];

export function OwnerPeople() {
  return (
    <>
      <PageHeader
        title="People"
        description="Agents, unit leaders, and tenants."
        action={
          <Link to="/owner/people/new">
            <Button size="sm">Add tenant</Button>
          </Link>
        }
      />
      <div className="flex flex-col gap-3">
        {people.map((p) => (
          <TenantCard key={p.name} {...p} />
        ))}
      </div>
    </>
  );
}
