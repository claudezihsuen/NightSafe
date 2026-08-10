import { Wallet } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { HeroCard } from "@/components/HeroCard";
import { UnitCard } from "@/components/UnitCard";

export function TenantHome() {
  return (
    <>
      <PageHeader title="Home" description="Sagewood Residences — Unit 2B" />

      <HeroCard
        eyebrow="This month"
        title="Your rent is due soon"
        description="$1,200.00 due by the 5th. Upload your receipt once paid."
        value="$1,200"
        valueLabel="due"
        icon={Wallet}
        className="mb-4"
      />

      <UnitCard unitLabel="Unit 2B" propertyName="Sagewood Residences · 12 Fern Lane" status="WAITING_PAYMENT" />
    </>
  );
}
