import { Building2, Users, Wallet, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";

const stats = [
  { label: "Properties", value: "6", icon: Building2 },
  { label: "Tenants", value: "24", icon: Users },
  { label: "Rent this month", value: "$18,400", icon: Wallet },
  { label: "Overdue", value: "2", icon: AlertCircle },
];

export function OwnerDashboard() {
  return (
    <>
      <PageHeader title="Dashboard" description="An overview of your portfolio." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
