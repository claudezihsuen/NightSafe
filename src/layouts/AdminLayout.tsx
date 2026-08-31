import { Users } from "lucide-react";
import { AppShell } from "./AppShell";
import type { NavItem } from "@/types";

const items: NavItem[] = [{ label: "Accounts", path: "/admin", icon: Users }];

export function AdminLayout() {
  return <AppShell items={items} roleLabel="Admin" />;
}
