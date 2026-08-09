import { Building2, Users, Wallet } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";

const stats = [
  { label: "Assigned properties", value: "2", icon: Building2 },
  { label: "Tenants", value: "9", icon: Users },
  { label: "Pending review", value: "3", icon: Wallet },
];

export function AgentDashboard() {
  return (
    <>
      <PageHeader title="Dashboard" description="Your assigned properties at a glance." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="flex flex-col gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-input bg-sage-50">
              <Icon className="h-[18px] w-[18px] text-sage-600" />
            </div>
            <div>
              <p className="text-xl font-semibold text-midnight-800">{value}</p>
              <p className="text-sm text-midnight-500/70">{label}</p>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
