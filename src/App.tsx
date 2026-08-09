import { Navigate, Route, Routes } from "react-router-dom";

import { LoginPage } from "@/pages/auth/LoginPage";

import { OwnerLayout } from "@/layouts/OwnerLayout";
import { OwnerDashboard } from "@/pages/owner/OwnerDashboard";
import { OwnerProperties } from "@/pages/owner/OwnerProperties";
import { OwnerPeople } from "@/pages/owner/OwnerPeople";
import { OwnerPayments } from "@/pages/owner/OwnerPayments";
import { OwnerAgreements } from "@/pages/owner/OwnerAgreements";

import { AgentLayout } from "@/layouts/AgentLayout";
import { AgentDashboard } from "@/pages/agent/AgentDashboard";
import { AgentProperties } from "@/pages/agent/AgentProperties";
import { AgentTenants } from "@/pages/agent/AgentTenants";
import { AgentPayments } from "@/pages/agent/AgentPayments";

import { UnitLeaderLayout } from "@/layouts/UnitLeaderLayout";
import { UnitLeaderDashboard } from "@/pages/unit-leader/UnitLeaderDashboard";
import { UnitLeaderWater } from "@/pages/unit-leader/UnitLeaderWater";
import { UnitLeaderElectricity } from "@/pages/unit-leader/UnitLeaderElectricity";
import { UnitLeaderHistory } from "@/pages/unit-leader/UnitLeaderHistory";

import { TenantLayout } from "@/layouts/TenantLayout";
import { TenantHome } from "@/pages/tenant/TenantHome";
import { TenantPayments } from "@/pages/tenant/TenantPayments";
import { TenantAgreement } from "@/pages/tenant/TenantAgreement";
import { TenantNotifications } from "@/pages/tenant/TenantNotifications";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />

      <Route path="/owner" element={<OwnerLayout />}>
        <Route index element={<OwnerDashboard />} />
        <Route path="properties" element={<OwnerProperties />} />
        <Route path="people" element={<OwnerPeople />} />
        <Route path="payments" element={<OwnerPayments />} />
        <Route path="agreements" element={<OwnerAgreements />} />
      </Route>

      <Route path="/agent" element={<AgentLayout />}>
        <Route index element={<AgentDashboard />} />
        <Route path="properties" element={<AgentProperties />} />
        <Route path="tenants" element={<AgentTenants />} />
        <Route path="payments" element={<AgentPayments />} />
      </Route>

      <Route path="/unit-leader" element={<UnitLeaderLayout />}>
        <Route index element={<UnitLeaderDashboard />} />
        <Route path="water" element={<UnitLeaderWater />} />
        <Route path="electricity" element={<UnitLeaderElectricity />} />
        <Route path="history" element={<UnitLeaderHistory />} />
      </Route>

      <Route path="/tenant" element={<TenantLayout />}>
        <Route index element={<TenantHome />} />
        <Route path="payments" element={<TenantPayments />} />
        <Route path="agreement" element={<TenantAgreement />} />
        <Route path="notifications" element={<TenantNotifications />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
