import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/types";

interface BottomNavProps {
  items: NavItem[];
}

export function BottomNav({ items }: BottomNavProps) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden"
      aria-label="Primary"
    >
      {items.map(({ label, path, icon: Icon }) => (
        <NavLink
          key={path}
          to={path}
          end
          className={({ isActive }) =>
            cn(
              "flex flex-1 flex-col items-center gap-1 rounded-input py-1.5 text-[11px] font-medium transition-colors",
              isActive ? "text-sage-700" : "text-ink/50 hover:text-ink",
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon className={cn("h-5 w-5", isActive && "stroke-[2.25]")} />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
