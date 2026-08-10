import { LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export function TopBar() {
  const { user, logout } = useAuth();

  return (
    <header className="flex items-center justify-between border-b border-border bg-white px-4 py-3 sm:px-6 lg:px-10">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">{user?.name}</p>
        <p className="truncate text-xs text-ink/50">{user?.email}</p>
      </div>
      <button
        onClick={() => logout()}
        className="flex items-center gap-1.5 rounded-input px-3 py-2 text-sm font-medium text-ink/60 transition-colors hover:bg-sage-50 hover:text-ink"
      >
        <LogOut className="h-4 w-4" />
        <span className="hidden sm:inline">Sign out</span>
      </button>
    </header>
  );
}
