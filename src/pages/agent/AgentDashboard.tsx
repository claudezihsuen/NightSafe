import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Building2, Clock3, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { HeroCard } from "@/components/HeroCard";
import { StatCard } from "@/components/StatCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";

interface DashboardData { units: number; tenants: number; pendingReviews: number; overduePayments: number }

export function AgentDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.get<DashboardData>("/api/agent/dashboard").then(setData).catch(() => setData(null)).finally(() => setLoading(false)); }, []);
  const d = data ?? { units: 0, tenants: 0, pendingReviews: 0, overduePayments: 0 };
  return <>
    <PageHeader title="Dashboard" description="Only the units and tenants inside your assigned scope." />
    {loading ? <Skeleton className="mb-5 h-40" /> : <HeroCard eyebrow="Assigned scope" title={d.pendingReviews ? `${d.pendingReviews} review${d.pendingReviews === 1 ? "" : "s"} waiting` : "Nothing waiting for review"} description={d.overduePayments ? `${d.overduePayments} overdue rent payment${d.overduePayments === 1 ? "" : "s"} in your assigned scope.` : "No overdue rent payments in your assigned scope."} value={String(d.tenants)} valueLabel="tenants" icon={Users} action={d.pendingReviews ? <Link to="/agent/payments"><Button size="sm">Review</Button></Link> : undefined} className="mb-5" />}
    {!loading && <div className="grid grid-cols-2 gap-4 lg:grid-cols-4"><StatCard icon={Building2} label="Assigned units" value={String(d.units)} /><StatCard icon={Users} label="Tenants" value={String(d.tenants)} /><StatCard icon={Clock3} label="Pending reviews" value={String(d.pendingReviews)} /><StatCard icon={AlertTriangle} label="Overdue payments" value={String(d.overduePayments)} /></div>}
  </>;
}
