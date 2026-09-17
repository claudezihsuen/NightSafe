import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { BottomNav } from "@/components/BottomNav";
import { TopBar } from "@/components/TopBar";
import { NotificationSettingsCard } from "@/components/notifications/NotificationSettingsCard";
import { HomeScreenExperienceBanner } from "@/components/pwa/HomeScreenExperienceBanner";
import type { NavItem } from "@/types";

interface AppShellProps {
  items: NavItem[];
  roleLabel: string;
}

export function AppShell({ items, roleLabel }: AppShellProps) {
  const location = useLocation();
  const showSettingsExtras = location.pathname.endsWith("/settings");

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar items={items} roleLabel={roleLabel} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 px-4 pb-24 pt-6 sm:px-6 lg:px-10 lg:pb-10 lg:pt-8">
          {showSettingsExtras && <HomeScreenExperienceBanner />}
          <div className="mx-auto w-full max-w-5xl">
            <Outlet />
            {showSettingsExtras && <div className="mt-5"><NotificationSettingsCard /></div>}
          </div>
        </main>
      </div>
      <BottomNav items={items} />
    </div>
  );
}
