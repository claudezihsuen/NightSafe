import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Users, Wallet, Droplets } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { HeroCard } from "@/components/HeroCard";
import { StatCard } from "@/components/StatCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import type { OwnerProperty } from "@/types";

export function OwnerDashboard() {
  const [properties, setProperties] = useState<OwnerProperty[]>([]);
  const [tenantCount, setTenantCount] = useState(0);
  const [pendingRent, setPendingRent] = useState(0);
  const [pendingUtilities, setPendingUtilities] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<{ properties: OwnerProperty[] }>("/api/owner/properties").catch(() => ({ properties: [] })),
      api.get<{ tenants: unknown[] }>("/api/owner/tenants").catch(() => ({ tenants: [] })),
      api.get<{ payments: unknown[] }>("/api/owner/payments/pending").catch(() => ({ payments: [] })),
      api.get<{ utilities: unknown[] }>("/api/owner/utilities/pending").catch(() => ({ utilities: [] })),
    ])
      .then(([propsData, tenantsData, paymentsData, utilitiesData]) => {
        setProperties(propsData.properties);
        setTenantCount(tenantsData.tenants.length);
        setPendingRent(paymentsData.payments.length);
        setPendingUtilities(utilitiesData.utilities.length);
      })
      .finally(() => setLoading(false));
  }, []);

  const unitCount = properties.reduce((sum, p) => sum + p.units.length, 0);
  const totalPending = pendingRent + pendingUtilities;

  const stats = [
    { label: "Properties", value: String(properties.length), icon: Building2 },
    { label: "Units", value: String(unitCount), icon: Building2 },
    { label: "Tenants", value: String(tenantCount), icon: Users },
    { label: "Pending utilities", value: String(pendingUtilities), icon: Droplets },
  ];

  return (
    <>
      <PageHeader title="Dashboard" description="An overview of your portfolio." />

      {loading ? (
        <Skeleton className="mb-6 h-40 w-full" />
      ) : (
        <HeroCard
          eyebrow="Payments"
          title={totalPending > 0 ? `${totalPending} payment${totalPending === 1 ? "" : "s"} awaiting review` : "Nothing to review"}
          description={
            totalPending > 0
              ? "Rent and utility payments submitted by tenants and unit leaders."
              : "You're all caught up on payment reviews."
          }
          value={String(totalPending)}
          valueLabel="pending"
          icon={Wallet}
          action={
            totalPending > 0 ? (
              <Link to="/owner/payments">
                <Button size="sm">Review now</Button>
              </Link>
            ) : undefined
          }
          className="mb-6"
        />
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((s) => (
            <StatCard key={s.label} icon={s.icon} label={s.label} value={s.value} />
          ))}
        </div>
      )}
    </>
  );
}
