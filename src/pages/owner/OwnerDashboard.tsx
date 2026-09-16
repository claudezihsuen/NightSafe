import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Users, Wallet, AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { HeroCard } from "@/components/HeroCard";
import { StatCard } from "@/components/StatCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import { formatCents } from "@/lib/format";

interface DashboardData {
  properties: number; units: number; tenants: number; expectedRent: number; confirmedRent: number;
  outstandingRent: number; pendingReviews: number; overduePayments: number; month: string;
}

export function OwnerDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.get<DashboardData>("/api/owner/dashboard").then(setData).catch(() => setData(null)).finally(() => setLoading(false)); }, []);

  if (loading) return <><PageHeader title="Dashboard" description="An overview of your portfolio." /><Skeleton className="mb-5 h-40" /><div className="grid grid-cols-2 gap-4 lg:grid-cols-4"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div></>;
  const d = data ?? { properties: 0, units: 0, tenants: 0, expectedRent: 0, confirmedRent: 0, outstandingRent: 0, pendingReviews: 0, overduePayments: 0, month: "" };
  return <>
    <PageHeader title="Dashboard" description="Portfolio, rent collection, and reviews using current NightSafe data." />
    <HeroCard eyebrow={d.month || "Current month"} title={d.pendingReviews ? `${d.pendingReviews} payment review${d.pendingReviews === 1 ? "" : "s"} need attention` : "Payment reviews are clear"} description={d.overduePayments ? `${d.overduePayments} rent payment${d.overduePayments === 1 ? " is" : "s are"} overdue.` : "No overdue rent payments in your portfolio."} value={formatCents(d.confirmedRent)} valueLabel="confirmed rent" icon={Wallet} action={d.pendingReviews ? <Link to="/owner/payments"><Button size="sm">Review payments</Button></Link> : undefined} className="mb-5" />
    <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4"><StatCard icon={Building2} label="Properties" value={String(d.properties)} /><StatCard icon={Building2} label="Units" value={String(d.units)} /><StatCard icon={Users} label="Tenants" value={String(d.tenants)} /><StatCard icon={Clock3} label="Pending reviews" value={String(d.pendingReviews)} /></div>
    <div className="grid gap-4 md:grid-cols-3"><StatCard icon={Wallet} label="Expected rent" value={formatCents(d.expectedRent)} /><StatCard icon={CheckCircle2} label="Confirmed rent" value={formatCents(d.confirmedRent)} /><StatCard icon={AlertTriangle} label="Outstanding rent" value={formatCents(d.outstandingRent)} /></div>
  </>;
}
