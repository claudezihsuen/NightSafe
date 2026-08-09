import { Users } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

export function OwnerPeople() {
  return (
    <>
      <PageHeader title="People" description="Agents, unit leaders, and tenants." />
      <EmptyState
        icon={Users}
        title="No people yet"
        description="Agents and tenants you add will show up here."
        action={<Button size="sm">Invite someone</Button>}
      />
    </>
  );
}
