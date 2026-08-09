import { Home, Wallet } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";

export function TenantHome() {
  return (
    <>
      <PageHeader title="Home" description="Sagewood Residences — Unit 2B" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-input bg-sage-50">
            <Home className="h-5 w-5 text-sage-600" />
          </div>
          <div>
            <p className="font-medium text-midnight-800">Sagewood Residences</p>
            <p className="text-sm text-midnight-500/70">Unit 2B · 12 Fern Lane</p>
          </div>
        </Card>
        <Card className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-input bg-sage-50">
              <Wallet className="h-5 w-5 text-sage-600" />
            </div>
            <div>
              <p className="font-medium text-midnight-800">Monthly rent</p>
              <p className="text-sm text-midnight-500/70">$1,200.00</p>
            </div>
          </div>
          <StatusBadge status="WAITING_PAYMENT" />
        </Card>
      </div>
    </>
  );
}
