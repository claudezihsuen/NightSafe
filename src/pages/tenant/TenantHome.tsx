import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, ChevronRight, FileText, History, ShieldCheck, Wallet } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { HeroCard } from "@/components/HeroCard";
import { UnitCard } from "@/components/UnitCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { formatCents, formatDate, formatMonth } from "@/lib/format";

interface RentRow { id?: string; month: string; amount: number; due_date: string; status: "WAITING_PAYMENT" | "PENDING_REVIEW" | "PAYMENT_CONFIRMED" }
interface DashboardData {
  tenancy: { id: string; propertyName: string; unitLabel: string } | null;
  currentRent?: RentRow;
  recentPayments: RentRow[];
  unreadNotifications: number;
  documentationCount: number;
}

const quickActions = [
  { label: "Payment history", description: "See recent and past rent", icon: History, to: "/tenant/payments" },
  { label: "Deposit", description: "View your deposit breakdown", icon: ShieldCheck, to: "/tenant/deposit" },
  { label: "Documentation", description: "Documents, uploads & signatures", icon: FileText, to: "/tenant/documentation" },
  { label: "Notifications", description: "Updates & reminders", icon: Bell, to: "/tenant/notifications" },
];

export function TenantHome() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.get<DashboardData>("/api/tenant/dashboard").then(setData).catch(() => setData(null)).finally(() => setLoading(false)); }, []);
  const firstName = user?.name?.split(" ")[0];
  const rent = data?.currentRent;
  const waiting = rent?.status === "WAITING_PAYMENT";
  return <div className="animate-fade-in-up">
    <PageHeader title={firstName ? `Welcome back, ${firstName}` : "Home"} description="Your current tenancy, rent, documents and notifications." />
    {loading ? <Skeleton className="mb-4 h-40" /> : <HeroCard eyebrow={rent ? formatMonth(rent.month) : "Current rent"} title={waiting ? "Your rent needs payment" : rent?.status === "PENDING_REVIEW" ? "Payment is under review" : rent ? "Rent is confirmed" : "No current rent obligation"} description={rent ? `${formatCents(rent.amount)} · due ${formatDate(rent.due_date)}` : "There is no current rent record for this tenancy."} value={rent ? formatCents(rent.amount) : undefined} valueLabel={waiting ? "due" : "current"} icon={Wallet} action={waiting && rent?.id ? <Link to={`/tenant/payments/${rent.id}/pay`}><Button size="sm">Make payment</Button></Link> : undefined} className="mb-4" />}
    <UnitCard unitLabel={data?.tenancy?.unitLabel ?? "No active unit"} propertyName={data?.tenancy?.propertyName ?? "Contact your Owner or Agent"} className="mb-6" />
    <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{quickActions.map(({ label, description, icon: Icon, to }) => <Link key={to} to={to} className="relative flex items-center gap-3 rounded-card border border-border bg-card p-4 shadow-subtle transition-colors hover:bg-sage-50/40 active:bg-sage-50 sm:flex-col sm:items-start sm:gap-2 sm:p-5"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-input bg-sage-50"><Icon className="h-5 w-5 text-sage-600" /></div><div className="min-w-0 flex-1"><p className="font-medium text-ink">{label}</p><p className="text-sm text-ink/60">{description}</p></div>{label === "Notifications" && (data?.unreadNotifications ?? 0) > 0 && <span className="absolute right-3 top-3 rounded-full bg-status-overdue px-2 py-0.5 text-xs font-semibold text-white">{data?.unreadNotifications}</span>}{label === "Documentation" && (data?.documentationCount ?? 0) > 0 && <span className="absolute right-3 top-3 rounded-full bg-sage-100 px-2 py-0.5 text-xs font-semibold text-sage-800">{data?.documentationCount}</span>}<ChevronRight className="h-4 w-4 shrink-0 text-ink/30 sm:hidden" /></Link>)}</div>
    {(data?.recentPayments.length ?? 0) > 0 && <section><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold text-ink">Recent payments</h2><Link to="/tenant/payments" className="text-sm font-medium text-sage-700">View all</Link></div><div className="grid gap-2 sm:grid-cols-2">{data?.recentPayments.slice(0,4).map((payment) => <Link key={`${payment.month}-${payment.id ?? "rent"}`} to={payment.id ? `/tenant/payments/${payment.id}` : "/tenant/payments"} className="rounded-card border border-border bg-card p-4 shadow-subtle"><div className="flex items-center justify-between gap-3"><div><p className="font-medium text-ink">{formatMonth(payment.month)}</p><p className="text-sm text-ink/60">{formatCents(payment.amount)}</p></div><span className="text-xs font-medium text-ink/50">{payment.status.replaceAll("_", " ")}</span></div></Link>)}</div></section>}
  </div>;
}
