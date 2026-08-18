import { Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "@/lib/auth-context";
import { ProtectedRoute } from "@/components/ProtectedRoute";

import { LoginPage } from "@/pages/auth/LoginPage";
import { ActivateAccountPage } from "@/pages/auth/ActivateAccountPage";

import { OwnerLayout } from "@/layouts/OwnerLayout";
import { OwnerDashboard } from "@/pages/owner/OwnerDashboard";
import { OwnerProperties } from "@/pages/owner/OwnerProperties";
import { OwnerPeople } from "@/pages/owner/OwnerPeople";
import { OwnerCreateTenant } from "@/pages/owner/OwnerCreateTenant";
import { OwnerCreateAgent } from "@/pages/owner/OwnerCreateAgent";
import { OwnerAgentDetail } from "@/pages/owner/OwnerAgentDetail";
import { OwnerAgentsProvider } from "@/lib/owner-agents-context";
import { OwnerPayments } from "@/pages/owner/OwnerPayments";
import { OwnerPaymentReview } from "@/pages/owner/OwnerPaymentReview";
import { OwnerPaymentsProvider } from "@/lib/owner-payments-context";
import { OwnerUtilityReview } from "@/pages/owner/OwnerUtilityReview";
import { OwnerUtilitiesProvider } from "@/lib/owner-utilities-context";
import { OwnerDepositManagement } from "@/pages/owner/OwnerDepositManagement";
import { OwnerAgreements } from "@/pages/owner/OwnerAgreements";

import { AgentLayout } from "@/layouts/AgentLayout";
import { AgentDashboard } from "@/pages/agent/AgentDashboard";
import { AgentProperties } from "@/pages/agent/AgentProperties";
import { AgentTenants } from "@/pages/agent/AgentTenants";
import { AgentCreateTenant } from "@/pages/agent/AgentCreateTenant";
import { AgentPayments } from "@/pages/agent/AgentPayments";
import { AgentPaymentReview } from "@/pages/agent/AgentPaymentReview";
import { AgentDataProvider } from "@/lib/agent-context";
import { AgentPaymentsProvider } from "@/lib/agent-payments-context";
import { AgentUtilityReview } from "@/pages/agent/AgentUtilityReview";
import { AgentUtilitiesProvider } from "@/lib/agent-utilities-context";
import { AgentDepositManagement } from "@/pages/agent/AgentDepositManagement";

import { UnitLeaderLayout } from "@/layouts/UnitLeaderLayout";
import { UnitLeaderDashboard } from "@/pages/unit-leader/UnitLeaderDashboard";
import { UnitLeaderWater } from "@/pages/unit-leader/UnitLeaderWater";
import { UnitLeaderElectricity } from "@/pages/unit-leader/UnitLeaderElectricity";
import { UnitLeaderHistory } from "@/pages/unit-leader/UnitLeaderHistory";
import { UnitLeaderProvider } from "@/lib/unit-leader-context";

import { TenantLayout } from "@/layouts/TenantLayout";
import { TenantHome } from "@/pages/tenant/TenantHome";
import { TenantPayments } from "@/pages/tenant/TenantPayments";
import { TenantPaymentDetails } from "@/pages/tenant/TenantPaymentDetails";
import { TenantMakePayment } from "@/pages/tenant/TenantMakePayment";
import { TenantAgreement } from "@/pages/tenant/TenantAgreement";
import { TenantDeposit } from "@/pages/tenant/TenantDeposit";
import { TenantNotifications } from "@/pages/tenant/TenantNotifications";
import { TenantPaymentsProvider } from "@/lib/tenant-payments-context";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/invite/:token" element={<ActivateAccountPage />} />

        <Route
          path="/owner"
          element={
            <ProtectedRoute allowedRoles={["OWNER"]}>
              <OwnerPaymentsProvider>
                <OwnerUtilitiesProvider>
                  <OwnerAgentsProvider>
                    <OwnerLayout />
                  </OwnerAgentsProvider>
                </OwnerUtilitiesProvider>
              </OwnerPaymentsProvider>
            </ProtectedRoute>
          }
        >
          <Route index element={<OwnerDashboard />} />
          <Route path="properties" element={<OwnerProperties />} />
          <Route path="people" element={<OwnerPeople />} />
          <Route path="people/new" element={<OwnerCreateTenant />} />
          <Route path="agents/new" element={<OwnerCreateAgent />} />
          <Route path="agents/:id" element={<OwnerAgentDetail />} />
          <Route path="payments" element={<OwnerPayments />} />
          <Route path="payments/:id" element={<OwnerPaymentReview />} />
          <Route path="utilities/:id" element={<OwnerUtilityReview />} />
          <Route path="leases/:leaseId/deposit" element={<OwnerDepositManagement />} />
          <Route path="agreements" element={<OwnerAgreements />} />
        </Route>

        <Route
          path="/agent"
          element={
            <ProtectedRoute allowedRoles={["AGENT"]}>
              <AgentDataProvider>
                <AgentPaymentsProvider>
                  <AgentUtilitiesProvider>
                    <AgentLayout />
                  </AgentUtilitiesProvider>
                </AgentPaymentsProvider>
              </AgentDataProvider>
            </ProtectedRoute>
          }
        >
          <Route index element={<AgentDashboard />} />
          <Route path="properties" element={<AgentProperties />} />
          <Route path="tenants" element={<AgentTenants />} />
          <Route path="tenants/new" element={<AgentCreateTenant />} />
          <Route path="payments" element={<AgentPayments />} />
          <Route path="payments/:id" element={<AgentPaymentReview />} />
          <Route path="utilities/:id" element={<AgentUtilityReview />} />
          <Route path="leases/:leaseId/deposit" element={<AgentDepositManagement />} />
        </Route>

        <Route
          path="/unit-leader"
          element={
            <ProtectedRoute allowedRoles={["UNIT_LEADER"]}>
              <UnitLeaderProvider>
                <UnitLeaderLayout />
              </UnitLeaderProvider>
            </ProtectedRoute>
          }
        >
          <Route index element={<UnitLeaderDashboard />} />
          <Route path="water" element={<UnitLeaderWater />} />
          <Route path="electricity" element={<UnitLeaderElectricity />} />
          <Route path="history" element={<UnitLeaderHistory />} />
        </Route>

        <Route
          path="/tenant"
          element={
            <ProtectedRoute allowedRoles={["TENANT"]}>
              <TenantPaymentsProvider>
                <TenantLayout />
              </TenantPaymentsProvider>
            </ProtectedRoute>
          }
        >
          <Route index element={<TenantHome />} />
          <Route path="payments" element={<TenantPayments />} />
          <Route path="payments/:id" element={<TenantPaymentDetails />} />
          <Route path="payments/:id/pay" element={<TenantMakePayment />} />
          <Route path="agreement" element={<TenantAgreement />} />
          <Route path="deposit" element={<TenantDeposit />} />
          <Route path="notifications" element={<TenantNotifications />} />
        </Route>

        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AuthProvider>
  );
}
