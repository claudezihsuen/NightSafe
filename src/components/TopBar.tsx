import { useEffect, useRef, useState } from "react";
import { LogOut, Settings, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/i18n/I18nProvider";
import { ROLE_HOME } from "@/i18n/translations";

export function TopBar() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const displayName = user?.nickname?.trim() || user?.name;
  const settingsPath = user ? `${ROLE_HOME[user.role]}/settings`.replace("//", "/") : "/login";

  async function signOut() {
    setOpen(false);
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <header className="relative z-40 flex items-center justify-between border-b border-border/80 bg-card/90 px-4 py-3 shadow-[0_1px_0_rgba(90,63,43,0.03)] backdrop-blur sm:px-6 lg:px-10">
      <div className="min-w-0" data-i18n-skip>
        <p className="truncate text-sm font-medium text-ink">{displayName}</p>
        <p className="truncate text-xs text-ink/50">{user?.email}</p>
      </div>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          aria-label="Account menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-gradient-to-br from-white to-sage-50 text-sage-700 shadow-subtle transition hover:-translate-y-0.5 hover:shadow-raised"
        >
          <UserRound className="h-5 w-5" />
        </button>

        {open && (
          <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-card border border-border bg-card shadow-raised">
            <div className="border-b border-border bg-sage-50/60 px-4 py-3" data-i18n-skip>
              <p className="truncate text-sm font-semibold text-ink">{displayName}</p>
              <p className="truncate text-xs text-ink/50">{user?.email}</p>
            </div>
            <div className="p-1.5">
              <button
                type="button"
                onClick={() => { setOpen(false); navigate(settingsPath); }}
                className="flex w-full items-center gap-2 rounded-input px-3 py-2 text-left text-sm font-medium text-ink/75 transition hover:bg-sage-50 hover:text-ink"
              >
                <Settings className="h-4 w-4" />
                {t("common.settings")}
              </button>
              <button
                type="button"
                onClick={() => void signOut()}
                className="flex w-full items-center gap-2 rounded-input px-3 py-2 text-left text-sm font-medium text-ink/75 transition hover:bg-[#F7E7E1] hover:text-status-overdue"
              >
                <LogOut className="h-4 w-4" />
                {t("common.signOut")}
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
