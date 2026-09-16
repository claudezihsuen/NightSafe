import { LayoutDashboard, Building2, Users, Wallet, FileText } from "lucide-react";
import { AppShell } from "./AppShell";
import type { NavItem } from "@/types";

const items: NavItem[] = [
  { label: "Dashboard", path: "/agent", icon: LayoutDashboard },
  { label: "Properties", path: "/agent/properties", icon: Building2 },
  { label: "Tenants", path: "/agent/tenants", icon: Users },
  { label: "Payments", path: "/agent/payments", icon: Wallet },
  { label: "Documentation", path: "/agent/documentation", icon: FileText },
];

export function AgentLayout() {
  return <AppShell items={items} roleLabel="Agent" />;
}
