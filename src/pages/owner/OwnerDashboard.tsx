import { Building2, Users, Wallet, AlertCircle, UploadCloud, UserPlus, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { HeroCard } from "@/components/HeroCard";
import { StatCard } from "@/components/StatCard";
import { ActivityItem } from "@/components/ActivityItem";

const stats = [
  { label: "Properties", value: "6", icon: Building2 },
  { label: "Tenants", value: "24", icon: Users },
  { label: "Rent this month", value: "$18,400", icon: Wallet },
  { label: "Overdue", value: "2", icon: AlertCircle },
];

const activity = [
  { icon: CheckCircle2, description: "Maria Lopez's rent payment was confirmed.", time: "2h ago" },
  { icon: UploadCloud, description: "James Okoro uploaded a rent receipt.", time: "5h ago" },
  { icon: UserPlus, description: "Priya Nair was added as a tenant.", time: "Yesterday" },
];

export function OwnerDashboard() {
  return (
    <>
      <PageHeader title="Dashboard" description="An overview of your portfolio." />

      <HeroCard
        eyebrow="This month"
        title="Rent collection is on track"
        description="$18,400 collected across 6 properties, with 2 payments still overdue."
        value="87%"
        valueLabel="collected"
        icon={Wallet}
        className="mb-6"
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <StatCard key={s.label} icon={s.icon} label={s.label} value={s.value} />
        ))}
      </div>

      <div className="mt-8">
        <h2 className="mb-4 text-sm font-semibold text-ink">Recent activity</h2>
        <div className="rounded-card border border-border bg-card p-5 shadow-subtle">
          {activity.map((a, i) => (
            <ActivityItem key={i} {...a} isLast={i === activity.length - 1} />
          ))}
        </div>
      </div>
    </>
  );
}
