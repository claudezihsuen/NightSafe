import { LayoutDashboard, Wallet, FileText, Bell } from "lucide-react";
import { AppShell } from "./AppShell";
import type { NavItem } from "@/types";

const items: NavItem[] = [
  { label: "Home", path: "/tenant", icon: LayoutDashboard },
  { label: "Payments", path: "/tenant/payments", icon: Wallet },
  { label: "Agreement", path: "/tenant/agreement", icon: FileText },
  { label: "Notifications", path: "/tenant/notifications", icon: Bell },
];

export function TenantLayout() {
  return <AppShell items={items} roleLabel="Tenant" />;
}
