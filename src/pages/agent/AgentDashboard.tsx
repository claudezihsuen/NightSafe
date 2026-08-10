import { Building2, Users, Wallet } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { HeroCard } from "@/components/HeroCard";
import { StatCard } from "@/components/StatCard";

const stats = [
  { label: "Assigned properties", value: "2", icon: Building2 },
  { label: "Tenants", value: "9", icon: Users },
  { label: "Pending review", value: "3", icon: Wallet },
];

export function AgentDashboard() {
  return (
    <>
      <PageHeader title="Dashboard" description="Your assigned properties at a glance." />

      <HeroCard
        eyebrow="Your scope"
        title="3 payments need review"
        description="Across Sagewood Residences and The Willow Court."
        value="9"
        valueLabel="tenants"
        icon={Users}
        className="mb-6"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <StatCard key={s.label} icon={s.icon} label={s.label} value={s.value} />
        ))}
      </div>
    </>
  );
}
