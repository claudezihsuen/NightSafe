import { Droplets, FileText, LayoutDashboard, Wallet, Zap } from "lucide-react";
import { AppShell } from "./AppShell";
import type { NavItem } from "@/types";

const items: NavItem[] = [
  { label: "Home", path: "/unit-leader", icon: LayoutDashboard },
  { label: "Payments", path: "/unit-leader/payments", icon: Wallet },
  { label: "Documentation", path: "/unit-leader/documentation", icon: FileText },
  { label: "Water", path: "/unit-leader/water", icon: Droplets },
  { label: "Electricity", path: "/unit-leader/electricity", icon: Zap },
];

export function UnitLeaderLayout() {
  return <AppShell items={items} roleLabel="Unit Leader" />;
}
