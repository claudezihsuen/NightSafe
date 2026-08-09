import { Zap } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";

export function UnitLeaderElectricity() {
  return (
    <>
      <PageHeader title="Electricity" description="Submit and track electricity payments." />
      <Card className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-input bg-sage-50">
              <Zap className="h-5 w-5 text-sage-600" />
            </div>
            <div>
              <p className="font-medium text-midnight-800">This month</p>
              <p className="text-sm text-midnight-500/70">$54.00</p>
            </div>
          </div>
          <StatusBadge status="PENDING_REVIEW" />
        </div>
        <Button icon={<Zap className="h-4 w-4" />}>Upload electricity receipt</Button>
      </Card>
    </>
  );
}
