import { LayoutDashboard, Building2, Users, Wallet, FileText, RefreshCcw } from "lucide-react";
import { AppShell } from "./AppShell";
import type { NavItem } from "@/types";

const items: NavItem[] = [
  { label: "Dashboard", path: "/owner", icon: LayoutDashboard },
  { label: "Properties", path: "/owner/properties", icon: Building2 },
  { label: "People", path: "/owner/people", icon: Users },
  { label: "Payments", path: "/owner/payments", icon: Wallet },
  { label: "Documentation", path: "/owner/documentation", icon: FileText },
  { label: "Tenant lifecycle", path: "/owner/lifecycle", icon: RefreshCcw },
];

export function OwnerLayout() {
  return <AppShell items={items} roleLabel="Owner" />;
}
