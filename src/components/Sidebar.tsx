import { NavLink } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/types";

interface SidebarProps {
  items: NavItem[];
  roleLabel: string;
}

export function Sidebar({ items, roleLabel }: SidebarProps) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-white px-4 py-6 lg:flex">
      <div className="mb-8 flex items-center gap-2 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-input bg-midnight-600">
          <ShieldCheck className="h-5 w-5 text-sage-200" />
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight text-ink">NightSafe</p>
          <p className="text-xs leading-tight text-ink/50">{roleLabel}</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {items.map(({ label, path, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-input px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sage-50 text-sage-700"
                  : "text-midnight-600 hover:bg-sage-50/60 hover:text-ink",
              )
            }
          >
            <Icon className="h-[18px] w-[18px]" />
            {label}
          </NavLink>
        ))}
      </nav>

      <p className="px-2 text-xs text-ink/40">Your space. Managed with care.</p>
    </aside>
  );
}
