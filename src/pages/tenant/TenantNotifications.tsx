import { Bell } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export function TenantNotifications() {
  return (
    <>
      <PageHeader title="Notifications" description="Updates about your rental." />
      <EmptyState
        icon={Bell}
        title="You're all caught up"
        description="New notifications from your property will appear here."
      />
    </>
  );
}
