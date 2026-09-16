import { useEffect, useState } from "react";
import { Droplets, Home, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { formatCents } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { HeroCard } from "@/components/HeroCard";
import { UnitCard } from "@/components/UnitCard";
import { PaymentCard } from "@/components/PaymentCard";
import { StatCard } from "@/components/StatCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";

interface Utility { id: string; type: string; month: string; amount: number; status: "WAITING_PAYMENT" | "PENDING_REVIEW" | "PAYMENT_CONFIRMED"; submitted_at: string | null }
interface DashboardData { unit: { id: string; label: string; propertyName: string } | null; water: Utility | null; electricity: Utility | null; pendingUtilityPayments: number }

export function UnitLeaderDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.get<DashboardData>("/api/unit-leader/dashboard").then(setData).catch(() => setData(null)).finally(() => setLoading(false)); }, []);
  return <>
    <PageHeader title="Dashboard" description="Your unit's water and electricity at a glance." />
    {loading ? <Skeleton className="h-40" /> : !data?.unit ? <EmptyState icon={Home} title="No unit assigned yet" description="Your Owner will assign a unit before utility payments can be managed." /> : <>
      <HeroCard
        eyebrow={data.unit.propertyName}
        title={data.pendingUtilityPayments > 0 ? `${data.pendingUtilityPayments} utility payment${data.pendingUtilityPayments === 1 ? "" : "s"} need attention` : "Your utilities are up to date"}
        description="Water and electricity for your assigned home, all in one place."
        value={data.unit.label}
        valueLabel="unit"
        icon={Home}
        className="mb-4"
      />
      <UnitCard unitLabel={data.unit.label} propertyName={data.unit.propertyName} className="mb-4" />
      <div className="mb-4 grid gap-3 sm:grid-cols-2"><PaymentCard title="Water" subtitle={data.water?.month ?? "No current record"} amount={data.water ? formatCents(data.water.amount) : "Not submitted"} status={data.water?.status ?? "WAITING_PAYMENT"} /><PaymentCard title="Electricity" subtitle={data.electricity?.month ?? "No current record"} amount={data.electricity ? formatCents(data.electricity.amount) : "Not submitted"} status={data.electricity?.status ?? "WAITING_PAYMENT"} /></div>
      <div className="grid grid-cols-3 gap-3"><StatCard icon={Home} label="Unit" value={data.unit.label} /><StatCard icon={Droplets} label="Water" value={data.water?.status === "PAYMENT_CONFIRMED" ? "Paid" : "Action"} /><StatCard icon={Zap} label="Pending utilities" value={String(data.pendingUtilityPayments)} /></div>
    </>}
  </>;
}
