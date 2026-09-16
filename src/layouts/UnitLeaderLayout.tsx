import { Bell, Droplets, History, LayoutDashboard, Zap } from "lucide-react";
import { AppShell } from "./AppShell";
import type { NavItem } from "@/types";

const items: NavItem[] = [
  { label: "Dashboard", path: "/unit-leader", icon: LayoutDashboard },
  { label: "Water", path: "/unit-leader/water", icon: Droplets },
  { label: "Electricity", path: "/unit-leader/electricity", icon: Zap },
  { label: "Notifications", path: "/unit-leader/notifications", icon: Bell },
  { label: "History", path: "/unit-leader/history", icon: History },
];

export function UnitLeaderLayout() {
  return <AppShell items={items} roleLabel="Unit Leader" />;
}
