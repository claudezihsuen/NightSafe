import { Users } from "lucide-react";
import { AppShell } from "./AppShell";
import { useAuth } from "@/lib/auth-context";
import type { NavItem } from "@/types";

const items: NavItem[] = [{ label: "Accounts", path: "/admin", icon: Users }];

export function AdminLayout() {
  const { user } = useAuth();
  return <AppShell items={items} roleLabel={user?.role === "SUPER_ADMIN" ? "Primary Admin" : "Admin"} />;
}
