import { LayoutDashboard, Wallet, FileText } from "lucide-react";
import { AppShell } from "./AppShell";
import { UnitLeaderLayout } from "./UnitLeaderLayout";
import { useAuth } from "@/lib/auth-context";
import type { NavItem } from "@/types";

const items: NavItem[] = [
  { label: "Home", path: "/tenant", icon: LayoutDashboard },
  { label: "Payments", path: "/tenant/payments", icon: Wallet },
  { label: "Documentation", path: "/tenant/documentation", icon: FileText },
];

export function TenantLayout() {
  const { user } = useAuth();
  if (user?.role === "UNIT_LEADER") return <UnitLeaderLayout />;
  return <AppShell items={items} roleLabel="Tenant" />;
}
