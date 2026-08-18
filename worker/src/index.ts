import type { Env } from "./types";
import { corsHeaders, withCors } from "./cors";
import { resolveSession, requireRole } from "./middleware/requireAuth";
import { login, logout, me, getInvite, activate } from "./auth/routes";
import {
  listProperties,
  createTenant,
  listAgents,
  createAgent,
  activateAgent,
  deactivateAgent,
  createAssignment,
  removeAssignment,
  listPendingPayments,
  getPaymentForReview,
  getPaymentReceipt,
  confirmPayment,
  rejectPayment,
  getPaymentAuditLog,
  listPendingUtilities as listOwnerPendingUtilities,
  getUtilityForReview as getOwnerUtilityForReview,
  getUtilityReceipt as getOwnerUtilityReceipt,
  confirmUtility as confirmOwnerUtility,
  rejectUtility as rejectOwnerUtility,
  listTenants as listOwnerTenants,
  getDeposit as getOwnerDeposit,
  createDepositItemRoute as createOwnerDepositItem,
  updateDepositItemRoute as updateOwnerDepositItem,
  deleteDepositItemRoute as deleteOwnerDepositItem,
  finalizeDepositRoute as finalizeOwnerDeposit,
  recordDepositPaymentRoute as recordOwnerDepositPayment,
  createDepositDeductionRoute as createOwnerDepositDeduction,
  deleteDepositDeductionRoute as deleteOwnerDepositDeduction,
  recordDepositReturnRoute as recordOwnerDepositReturn,
  getDepositDeductionReceiptRoute as getOwnerDepositDeductionReceipt,
  getDepositPaymentReceiptRoute as getOwnerDepositPaymentReceipt,
} from "./owner/routes";
import { listPayments, getPayment, submitPayment, getReceipt, getMyDeposit, getMyDeductionReceipt } from "./tenant/routes";
import {
  listAssignedProperties,
  listAssignedTenants,
  createTenant as createTenantAsAgent,
  listPendingPayments as listAgentPendingPayments,
  getPaymentForReview as getAgentPaymentForReview,
  getPaymentReceipt as getAgentPaymentReceipt,
  confirmPayment as confirmAgentPayment,
  rejectPayment as rejectAgentPayment,
  listPendingUtilities as listAgentPendingUtilities,
  getUtilityForReview as getAgentUtilityForReview,
  getUtilityReceipt as getAgentUtilityReceipt,
  confirmUtility as confirmAgentUtility,
  rejectUtility as rejectAgentUtility,
  getDeposit as getAgentDeposit,
  createDepositItemRoute as createAgentDepositItem,
  updateDepositItemRoute as updateAgentDepositItem,
  deleteDepositItemRoute as deleteAgentDepositItem,
  finalizeDepositRoute as finalizeAgentDeposit,
  recordDepositPaymentRoute as recordAgentDepositPayment,
  createDepositDeductionRoute as createAgentDepositDeduction,
  deleteDepositDeductionRoute as deleteAgentDepositDeduction,
  recordDepositReturnRoute as recordAgentDepositReturn,
  getDepositDeductionReceiptRoute as getAgentDepositDeductionReceipt,
  getDepositPaymentReceiptRoute as getAgentDepositPaymentReceipt,
} from "./agent/routes";
import { getMyUnit, listUtilities, getUtilityReceipt as getMyUtilityReceipt, submitUtility } from "./unit-leader/routes";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const TENANT_PAYMENT_ID = /^\/api\/tenant\/payments\/([^/]+)$/;
const TENANT_PAYMENT_SUBMIT = /^\/api\/tenant\/payments\/([^/]+)\/submit$/;
const TENANT_PAYMENT_RECEIPT = /^\/api\/tenant\/payments\/([^/]+)\/receipt$/;

const OWNER_PAYMENT_ID = /^\/api\/owner\/payments\/([^/]+)$/;
const OWNER_PAYMENT_RECEIPT = /^\/api\/owner\/payments\/([^/]+)\/receipt$/;
const OWNER_PAYMENT_CONFIRM = /^\/api\/owner\/payments\/([^/]+)\/confirm$/;
const OWNER_PAYMENT_REJECT = /^\/api\/owner\/payments\/([^/]+)\/reject$/;
const OWNER_PAYMENT_AUDIT = /^\/api\/owner\/payments\/([^/]+)\/audit$/;

const AGENT_PAYMENT_ID = /^\/api\/agent\/payments\/([^/]+)$/;
const AGENT_PAYMENT_RECEIPT = /^\/api\/agent\/payments\/([^/]+)\/receipt$/;
const AGENT_PAYMENT_CONFIRM = /^\/api\/agent\/payments\/([^/]+)\/confirm$/;
const AGENT_PAYMENT_REJECT = /^\/api\/agent\/payments\/([^/]+)\/reject$/;

const OWNER_AGENT_ACTIVATE = /^\/api\/owner\/agents\/([^/]+)\/activate$/;
const OWNER_AGENT_DEACTIVATE = /^\/api\/owner\/agents\/([^/]+)\/deactivate$/;
const OWNER_AGENT_ASSIGNMENTS = /^\/api\/owner\/agents\/([^/]+)\/assignments$/;
const OWNER_AGENT_ASSIGNMENT_ITEM = /^\/api\/owner\/agents\/([^/]+)\/assignments\/([^/]+)$/;

const OWNER_UTILITY_ID = /^\/api\/owner\/utilities\/([^/]+)$/;
const OWNER_UTILITY_RECEIPT = /^\/api\/owner\/utilities\/([^/]+)\/receipt$/;
const OWNER_UTILITY_CONFIRM = /^\/api\/owner\/utilities\/([^/]+)\/confirm$/;
const OWNER_UTILITY_REJECT = /^\/api\/owner\/utilities\/([^/]+)\/reject$/;

const AGENT_UTILITY_ID = /^\/api\/agent\/utilities\/([^/]+)$/;
const AGENT_UTILITY_RECEIPT = /^\/api\/agent\/utilities\/([^/]+)\/receipt$/;
const AGENT_UTILITY_CONFIRM = /^\/api\/agent\/utilities\/([^/]+)\/confirm$/;
const AGENT_UTILITY_REJECT = /^\/api\/agent\/utilities\/([^/]+)\/reject$/;

const UNIT_LEADER_UTILITY_RECEIPT = /^\/api\/unit-leader\/utilities\/([^/]+)\/receipt$/;

const OWNER_LEASE_DEPOSIT = /^\/api\/owner\/leases\/([^/]+)\/deposit$/;
const OWNER_LEASE_DEPOSIT_ITEMS = /^\/api\/owner\/leases\/([^/]+)\/deposit\/items$/;
const OWNER_LEASE_DEPOSIT_FINALIZE = /^\/api\/owner\/leases\/([^/]+)\/deposit\/finalize$/;
const OWNER_LEASE_DEPOSIT_DEDUCTIONS = /^\/api\/owner\/leases\/([^/]+)\/deposit\/deductions$/;
const OWNER_LEASE_DEPOSIT_RETURNS = /^\/api\/owner\/leases\/([^/]+)\/deposit\/returns$/;
const OWNER_DEPOSIT_ITEM = /^\/api\/owner\/deposit-items\/([^/]+)$/;
const OWNER_DEPOSIT_ITEM_PAYMENTS = /^\/api\/owner\/deposit-items\/([^/]+)\/payments$/;
const OWNER_DEPOSIT_PAYMENT_RECEIPT = /^\/api\/owner\/deposit-payments\/([^/]+)\/receipt$/;
const OWNER_DEPOSIT_DEDUCTION = /^\/api\/owner\/deposit-deductions\/([^/]+)$/;
const OWNER_DEPOSIT_DEDUCTION_RECEIPT = /^\/api\/owner\/deposit-deductions\/([^/]+)\/receipt$/;

const AGENT_LEASE_DEPOSIT = /^\/api\/agent\/leases\/([^/]+)\/deposit$/;
const AGENT_LEASE_DEPOSIT_ITEMS = /^\/api\/agent\/leases\/([^/]+)\/deposit\/items$/;
const AGENT_LEASE_DEPOSIT_FINALIZE = /^\/api\/agent\/leases\/([^/]+)\/deposit\/finalize$/;
const AGENT_LEASE_DEPOSIT_DEDUCTIONS = /^\/api\/agent\/leases\/([^/]+)\/deposit\/deductions$/;
const AGENT_LEASE_DEPOSIT_RETURNS = /^\/api\/agent\/leases\/([^/]+)\/deposit\/returns$/;
const AGENT_DEPOSIT_ITEM = /^\/api\/agent\/deposit-items\/([^/]+)$/;
const AGENT_DEPOSIT_ITEM_PAYMENTS = /^\/api\/agent\/deposit-items\/([^/]+)\/payments$/;
const AGENT_DEPOSIT_PAYMENT_RECEIPT = /^\/api\/agent\/deposit-payments\/([^/]+)\/receipt$/;
const AGENT_DEPOSIT_DEDUCTION = /^\/api\/agent\/deposit-deductions\/([^/]+)$/;
const AGENT_DEPOSIT_DEDUCTION_RECEIPT = /^\/api\/agent\/deposit-deductions\/([^/]+)\/receipt$/;

const TENANT_DEPOSIT_DEDUCTION_RECEIPT = /^\/api\/tenant\/deposit\/deductions\/([^/]+)\/receipt$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    let response: Response;

    try {
      // --- Auth ---
      if (pathname === "/api/auth/login" && method === "POST") {
        response = await login(request, env);
      } else if (pathname === "/api/auth/logout" && method === "POST") {
        response = await logout(request, env);
      } else if (pathname === "/api/auth/me" && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        response = await me(sessionUser);
      } else if (pathname.startsWith("/api/auth/invite/") && method === "GET") {
        const token = pathname.split("/").pop()!;
        response = await getInvite(env, token);
      } else if (pathname.startsWith("/api/auth/activate/") && method === "POST") {
        const token = pathname.split("/").pop()!;
        response = await activate(request, env, token);

        // --- Owner: properties / tenants ---
      } else if (pathname === "/api/owner/properties" && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          response = await listProperties(env, sessionUser!);
        }
      } else if (pathname === "/api/owner/tenants" && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          response = await createTenant(request, env, sessionUser!);
        }

        // --- Owner: agent management ---
      } else if (pathname === "/api/owner/agents" && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          response = await listAgents(env, sessionUser!);
        }
      } else if (pathname === "/api/owner/agents" && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          response = await createAgent(request, env, sessionUser!);
        }
      } else if (OWNER_AGENT_ACTIVATE.test(pathname) && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, agentId] = pathname.match(OWNER_AGENT_ACTIVATE)!;
          response = await activateAgent(env, sessionUser!, agentId);
        }
      } else if (OWNER_AGENT_DEACTIVATE.test(pathname) && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, agentId] = pathname.match(OWNER_AGENT_DEACTIVATE)!;
          response = await deactivateAgent(env, sessionUser!, agentId);
        }
      } else if (OWNER_AGENT_ASSIGNMENT_ITEM.test(pathname) && method === "DELETE") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, agentId, assignmentId] = pathname.match(OWNER_AGENT_ASSIGNMENT_ITEM)!;
          response = await removeAssignment(env, sessionUser!, agentId, assignmentId);
        }
      } else if (OWNER_AGENT_ASSIGNMENTS.test(pathname) && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, agentId] = pathname.match(OWNER_AGENT_ASSIGNMENTS)!;
          response = await createAssignment(request, env, sessionUser!, agentId);
        }

        // --- Owner: rent payment review ---
      } else if (pathname === "/api/owner/payments/pending" && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          response = await listPendingPayments(env, sessionUser!);
        }
      } else if (OWNER_PAYMENT_RECEIPT.test(pathname) && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) {
          response = new Response("Not authorized.", { status: 403 });
        } else {
          const [, id] = pathname.match(OWNER_PAYMENT_RECEIPT)!;
          response = await getPaymentReceipt(env, sessionUser!, id);
        }
      } else if (OWNER_PAYMENT_CONFIRM.test(pathname) && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, id] = pathname.match(OWNER_PAYMENT_CONFIRM)!;
          response = await confirmPayment(env, sessionUser!, id);
        }
      } else if (OWNER_PAYMENT_REJECT.test(pathname) && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, id] = pathname.match(OWNER_PAYMENT_REJECT)!;
          response = await rejectPayment(request, env, sessionUser!, id);
        }
      } else if (OWNER_PAYMENT_AUDIT.test(pathname) && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, id] = pathname.match(OWNER_PAYMENT_AUDIT)!;
          response = await getPaymentAuditLog(env, sessionUser!, id);
        }
      } else if (OWNER_PAYMENT_ID.test(pathname) && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, id] = pathname.match(OWNER_PAYMENT_ID)!;
          response = await getPaymentForReview(env, sessionUser!, id);
        }

        // --- Owner: utility payment review ---
      } else if (pathname === "/api/owner/utilities/pending" && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          response = await listOwnerPendingUtilities(env, sessionUser!);
        }
      } else if (OWNER_UTILITY_RECEIPT.test(pathname) && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) {
          response = new Response("Not authorized.", { status: 403 });
        } else {
          const [, id] = pathname.match(OWNER_UTILITY_RECEIPT)!;
          response = await getOwnerUtilityReceipt(env, sessionUser!, id);
        }
      } else if (OWNER_UTILITY_CONFIRM.test(pathname) && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, id] = pathname.match(OWNER_UTILITY_CONFIRM)!;
          response = await confirmOwnerUtility(env, sessionUser!, id);
        }
      } else if (OWNER_UTILITY_REJECT.test(pathname) && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, id] = pathname.match(OWNER_UTILITY_REJECT)!;
          response = await rejectOwnerUtility(request, env, sessionUser!, id);
        }
      } else if (OWNER_UTILITY_ID.test(pathname) && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, id] = pathname.match(OWNER_UTILITY_ID)!;
          response = await getOwnerUtilityForReview(env, sessionUser!, id);
        }

        // --- Owner: tenants + deposits ---
      } else if (pathname === "/api/owner/tenants" && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          response = await listOwnerTenants(env, sessionUser!);
        }
      } else if (OWNER_LEASE_DEPOSIT_ITEMS.test(pathname) && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, leaseId] = pathname.match(OWNER_LEASE_DEPOSIT_ITEMS)!;
          response = await createOwnerDepositItem(request, env, sessionUser!, leaseId);
        }
      } else if (OWNER_LEASE_DEPOSIT_FINALIZE.test(pathname) && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, leaseId] = pathname.match(OWNER_LEASE_DEPOSIT_FINALIZE)!;
          response = await finalizeOwnerDeposit(env, sessionUser!, leaseId);
        }
      } else if (OWNER_LEASE_DEPOSIT_DEDUCTIONS.test(pathname) && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, leaseId] = pathname.match(OWNER_LEASE_DEPOSIT_DEDUCTIONS)!;
          response = await createOwnerDepositDeduction(request, env, sessionUser!, leaseId);
        }
      } else if (OWNER_LEASE_DEPOSIT_RETURNS.test(pathname) && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, leaseId] = pathname.match(OWNER_LEASE_DEPOSIT_RETURNS)!;
          response = await recordOwnerDepositReturn(request, env, sessionUser!, leaseId);
        }
      } else if (OWNER_LEASE_DEPOSIT.test(pathname) && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, leaseId] = pathname.match(OWNER_LEASE_DEPOSIT)!;
          response = await getOwnerDeposit(env, sessionUser!, leaseId);
        }
      } else if (OWNER_DEPOSIT_ITEM_PAYMENTS.test(pathname) && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, itemId] = pathname.match(OWNER_DEPOSIT_ITEM_PAYMENTS)!;
          response = await recordOwnerDepositPayment(request, env, sessionUser!, itemId);
        }
      } else if (OWNER_DEPOSIT_ITEM.test(pathname) && method === "PATCH") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, itemId] = pathname.match(OWNER_DEPOSIT_ITEM)!;
          response = await updateOwnerDepositItem(request, env, sessionUser!, itemId);
        }
      } else if (OWNER_DEPOSIT_ITEM.test(pathname) && method === "DELETE") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, itemId] = pathname.match(OWNER_DEPOSIT_ITEM)!;
          response = await deleteOwnerDepositItem(env, sessionUser!, itemId);
        }
      } else if (OWNER_DEPOSIT_PAYMENT_RECEIPT.test(pathname) && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) {
          response = new Response("Not authorized.", { status: 403 });
        } else {
          const [, paymentId] = pathname.match(OWNER_DEPOSIT_PAYMENT_RECEIPT)!;
          response = await getOwnerDepositPaymentReceipt(env, sessionUser!, paymentId);
        }
      } else if (OWNER_DEPOSIT_DEDUCTION_RECEIPT.test(pathname) && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) {
          response = new Response("Not authorized.", { status: 403 });
        } else {
          const [, deductionId] = pathname.match(OWNER_DEPOSIT_DEDUCTION_RECEIPT)!;
          response = await getOwnerDepositDeductionReceipt(env, sessionUser!, deductionId);
        }
      } else if (OWNER_DEPOSIT_DEDUCTION.test(pathname) && method === "DELETE") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, deductionId] = pathname.match(OWNER_DEPOSIT_DEDUCTION)!;
          response = await deleteOwnerDepositDeduction(env, sessionUser!, deductionId);
        }

        // --- Agent ---
      } else if (pathname === "/api/agent/properties" && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["AGENT"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          response = await listAssignedProperties(env, sessionUser!);
        }
      } else if (pathname === "/api/agent/tenants" && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["AGENT"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          response = await listAssignedTenants(env, sessionUser!);
        }
      } else if (pathname === "/api/agent/tenants" && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["AGENT"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          response = await createTenantAsAgent(request, env, sessionUser!);
        }

        // --- Agent: rent payment review ---
      } else if (pathname === "/api/agent/payments/pending" && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["AGENT"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          response = await listAgentPendingPayments(env, sessionUser!);
        }
      } else if (AGENT_PAYMENT_RECEIPT.test(pathname) && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["AGENT"])) {
          response = new Response("Not authorized.", { status: 403 });
        } else {
          const [, id] = pathname.match(AGENT_PAYMENT_RECEIPT)!;
          response = await getAgentPaymentReceipt(env, sessionUser!, id);
        }
      } else if (AGENT_PAYMENT_CONFIRM.test(pathname) && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["AGENT"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, id] = pathname.match(AGENT_PAYMENT_CONFIRM)!;
          response = await confirmAgentPayment(env, sessionUser!, id);
        }
      } else if (AGENT_PAYMENT_REJECT.test(pathname) && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["AGENT"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, id] = pathname.match(AGENT_PAYMENT_REJECT)!;
          response = await rejectAgentPayment(request, env, sessionUser!, id);
        }
      } else if (AGENT_PAYMENT_ID.test(pathname) && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["AGENT"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, id] = pathname.match(AGENT_PAYMENT_ID)!;
          response = await getAgentPaymentForReview(env, sessionUser!, id);
        }

        // --- Agent: utility payment review ---
      } else if (pathname === "/api/agent/utilities/pending" && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["AGENT"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          response = await listAgentPendingUtilities(env, sessionUser!);
        }
      } else if (AGENT_UTILITY_RECEIPT.test(pathname) && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["AGENT"])) {
          response = new Response("Not authorized.", { status: 403 });
        } else {
          const [, id] = pathname.match(AGENT_UTILITY_RECEIPT)!;
          response = await getAgentUtilityReceipt(env, sessionUser!, id);
        }
      } else if (AGENT_UTILITY_CONFIRM.test(pathname) && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["AGENT"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, id] = pathname.match(AGENT_UTILITY_CONFIRM)!;
          response = await confirmAgentUtility(env, sessionUser!, id);
        }
      } else if (AGENT_UTILITY_REJECT.test(pathname) && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["AGENT"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, id] = pathname.match(AGENT_UTILITY_REJECT)!;
          response = await rejectAgentUtility(request, env, sessionUser!, id);
        }
      } else if (AGENT_UTILITY_ID.test(pathname) && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["AGENT"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, id] = pathname.match(AGENT_UTILITY_ID)!;
          response = await getAgentUtilityForReview(env, sessionUser!, id);
        }

        // --- Agent: deposits ---
      } else if (AGENT_LEASE_DEPOSIT_ITEMS.test(pathname) && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["AGENT"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, leaseId] = pathname.match(AGENT_LEASE_DEPOSIT_ITEMS)!;
          response = await createAgentDepositItem(request, env, sessionUser!, leaseId);
        }
      } else if (AGENT_LEASE_DEPOSIT_FINALIZE.test(pathname) && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["AGENT"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, leaseId] = pathname.match(AGENT_LEASE_DEPOSIT_FINALIZE)!;
          response = await finalizeAgentDeposit(env, sessionUser!, leaseId);
        }
      } else if (AGENT_LEASE_DEPOSIT_DEDUCTIONS.test(pathname) && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["AGENT"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, leaseId] = pathname.match(AGENT_LEASE_DEPOSIT_DEDUCTIONS)!;
          response = await createAgentDepositDeduction(request, env, sessionUser!, leaseId);
        }
      } else if (AGENT_LEASE_DEPOSIT_RETURNS.test(pathname) && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["AGENT"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, leaseId] = pathname.match(AGENT_LEASE_DEPOSIT_RETURNS)!;
          response = await recordAgentDepositReturn(request, env, sessionUser!, leaseId);
        }
      } else if (AGENT_LEASE_DEPOSIT.test(pathname) && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["AGENT"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, leaseId] = pathname.match(AGENT_LEASE_DEPOSIT)!;
          response = await getAgentDeposit(env, sessionUser!, leaseId);
        }
      } else if (AGENT_DEPOSIT_ITEM_PAYMENTS.test(pathname) && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["AGENT"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, itemId] = pathname.match(AGENT_DEPOSIT_ITEM_PAYMENTS)!;
          response = await recordAgentDepositPayment(request, env, sessionUser!, itemId);
        }
      } else if (AGENT_DEPOSIT_ITEM.test(pathname) && method === "PATCH") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["AGENT"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, itemId] = pathname.match(AGENT_DEPOSIT_ITEM)!;
          response = await updateAgentDepositItem(request, env, sessionUser!, itemId);
        }
      } else if (AGENT_DEPOSIT_ITEM.test(pathname) && method === "DELETE") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["AGENT"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, itemId] = pathname.match(AGENT_DEPOSIT_ITEM)!;
          response = await deleteAgentDepositItem(env, sessionUser!, itemId);
        }
      } else if (AGENT_DEPOSIT_PAYMENT_RECEIPT.test(pathname) && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["AGENT"])) {
          response = new Response("Not authorized.", { status: 403 });
        } else {
          const [, paymentId] = pathname.match(AGENT_DEPOSIT_PAYMENT_RECEIPT)!;
          response = await getAgentDepositPaymentReceipt(env, sessionUser!, paymentId);
        }
      } else if (AGENT_DEPOSIT_DEDUCTION_RECEIPT.test(pathname) && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["AGENT"])) {
          response = new Response("Not authorized.", { status: 403 });
        } else {
          const [, deductionId] = pathname.match(AGENT_DEPOSIT_DEDUCTION_RECEIPT)!;
          response = await getAgentDepositDeductionReceipt(env, sessionUser!, deductionId);
        }
      } else if (AGENT_DEPOSIT_DEDUCTION.test(pathname) && method === "DELETE") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["AGENT"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, deductionId] = pathname.match(AGENT_DEPOSIT_DEDUCTION)!;
          response = await deleteAgentDepositDeduction(env, sessionUser!, deductionId);
        }

        // --- Unit Leader ---
      } else if (pathname === "/api/unit-leader/unit" && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["UNIT_LEADER"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          response = await getMyUnit(env, sessionUser!);
        }
      } else if (pathname === "/api/unit-leader/utilities" && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["UNIT_LEADER"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          response = await listUtilities(env, sessionUser!);
        }
      } else if (pathname === "/api/unit-leader/utilities/submit" && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["UNIT_LEADER"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          response = await submitUtility(request, env, sessionUser!);
        }
      } else if (UNIT_LEADER_UTILITY_RECEIPT.test(pathname) && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["UNIT_LEADER"])) {
          response = new Response("Not authorized.", { status: 403 });
        } else {
          const [, id] = pathname.match(UNIT_LEADER_UTILITY_RECEIPT)!;
          response = await getMyUtilityReceipt(env, sessionUser!, id);
        }

        // --- Tenant ---
      } else if (pathname === "/api/tenant/payments" && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["TENANT"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          response = await listPayments(env, sessionUser!);
        }
      } else if (TENANT_PAYMENT_SUBMIT.test(pathname) && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["TENANT"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, id] = pathname.match(TENANT_PAYMENT_SUBMIT)!;
          response = await submitPayment(request, env, sessionUser!, id);
        }
      } else if (TENANT_PAYMENT_RECEIPT.test(pathname) && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["TENANT"])) {
          response = new Response("Not authorized.", { status: 403 });
        } else {
          const [, id] = pathname.match(TENANT_PAYMENT_RECEIPT)!;
          response = await getReceipt(env, sessionUser!, id);
        }
      } else if (TENANT_PAYMENT_ID.test(pathname) && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["TENANT"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          const [, id] = pathname.match(TENANT_PAYMENT_ID)!;
          response = await getPayment(env, sessionUser!, id);
        }
      } else if (pathname === "/api/tenant/deposit" && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["TENANT"])) {
          response = json({ error: "Not authorized." }, 403);
        } else {
          response = await getMyDeposit(env, sessionUser!);
        }
      } else if (TENANT_DEPOSIT_DEDUCTION_RECEIPT.test(pathname) && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["TENANT"])) {
          response = new Response("Not authorized.", { status: 403 });
        } else {
          const [, id] = pathname.match(TENANT_DEPOSIT_DEDUCTION_RECEIPT)!;
          response = await getMyDeductionReceipt(env, sessionUser!, id);
        }
      } else {
        response = json({ error: "Not found." }, 404);
      }
    } catch (err) {
      console.error(err);
      response = json({ error: "Internal server error." }, 500);
    }

    return withCors(response, request, env);
  },
};
