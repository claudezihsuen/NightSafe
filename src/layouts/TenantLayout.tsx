import { LayoutDashboard, Wallet, FileText } from "lucide-react";
import { AppShell } from "./AppShell";
import type { NavItem } from "@/types";

const items: NavItem[] = [
  { label: "Home", path: "/tenant", icon: LayoutDashboard },
  { label: "Payments", path: "/tenant/payments", icon: Wallet },
  { label: "Documentation", path: "/tenant/documentation", icon: FileText },
];

export function TenantLayout() {
  return <AppShell items={items} roleLabel="Tenant" />;
}
