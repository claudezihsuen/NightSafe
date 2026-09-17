import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/types";

interface SidebarProps {
  items: NavItem[];
  roleLabel: string;
}

export function Sidebar({ items }: SidebarProps) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-white px-4 py-6 lg:flex">
      <div className="mb-8 px-1">
        <img
          src="/brand/nightsafe-lockup.svg"
          alt="NightSafe — Properties rest easier"
          className="h-auto w-[205px]"
        />
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
    </aside>
  );
}
