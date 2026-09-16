import coreWorker from "./index";
import type { Env } from "./types";
import { withCors } from "./cors";
import { resolveSession, requireRole } from "./middleware/requireAuth";
import { createAdminAccount, initiatePasswordReset, listUsers, setUserStatus } from "./admin/routes";
import { markMyNotificationsRead } from "./tenant/routes";
import { downloadOwnerAgreement, listOwnerAgreements } from "./owner/agreements";
import {
  createAgentHardened,
  createAssignmentHardened,
  createUnitLeaderHardened,
  getHardenedDeposit,
  guardCreateUnitOnActiveProperty,
  guardDepositDeduction,
  guardDepositPayment,
  guardDepositReturn,
  guardTenantTargetActive,
  listAgentActiveProperties,
  reassignUnitLeaderHardened,
} from "./hardening/business";

const ADMIN_RESET_PASSWORD = /^\/api\/admin\/users\/([^/]+)\/reset-password$/;
const ADMIN_USER_STATUS = /^\/api\/admin\/users\/([^/]+)\/status$/;
const TENANT_NOTIFICATIONS_READ_ALL = "/api/tenant/notifications/read-all";
const OWNER_AGREEMENT_DOWNLOAD = /^\/api\/owner\/agreements\/([^/]+)\/download$/;

const OWNER_PROPERTY_UNITS = /^\/api\/owner\/properties\/([^/]+)\/units$/;
const OWNER_AGENT_ASSIGNMENTS = /^\/api\/owner\/agents\/([^/]+)\/assignments$/;
const OWNER_UNIT_LEADER_UNIT = /^\/api\/owner\/unit-leaders\/([^/]+)\/unit$/;

const OWNER_LEASE_DEPOSIT = /^\/api\/owner\/leases\/([^/]+)\/deposit$/;
const OWNER_LEASE_DEPOSIT_DEDUCTIONS = /^\/api\/owner\/leases\/([^/]+)\/deposit\/deductions$/;
const OWNER_LEASE_DEPOSIT_RETURNS = /^\/api\/owner\/leases\/([^/]+)\/deposit\/returns$/;
const OWNER_DEPOSIT_ITEM_PAYMENTS = /^\/api\/owner\/deposit-items\/([^/]+)\/payments$/;

const AGENT_LEASE_DEPOSIT = /^\/api\/agent\/leases\/([^/]+)\/deposit$/;
const AGENT_LEASE_DEPOSIT_DEDUCTIONS = /^\/api\/agent\/leases\/([^/]+)\/deposit\/deductions$/;
const AGENT_LEASE_DEPOSIT_RETURNS = /^\/api\/agent\/leases\/([^/]+)\/deposit\/returns$/;
const AGENT_DEPOSIT_ITEM_PAYMENTS = /^\/api\/agent\/deposit-items\/([^/]+)\/payments$/;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function cors(response: Response, request: Request, env: Env): Response {
  return withCors(response, request, env);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    // Reuse the core Worker's single preflight implementation everywhere.
    if (method === "OPTIONS") return coreWorker.fetch(request, env);

    try {
      // ---------------------------------------------------------------------
      // Business-hardening routes. These intentionally sit in front of the
      // original large router so the legacy routing surface stays stable.
      // ---------------------------------------------------------------------
      if (pathname === "/api/owner/agents" && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) return cors(json({ error: "Not authorized." }, 403), request, env);
        return cors(await createAgentHardened(request, env, sessionUser!), request, env);
      }

      if (OWNER_AGENT_ASSIGNMENTS.test(pathname) && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) return cors(json({ error: "Not authorized." }, 403), request, env);
        const [, agentId] = pathname.match(OWNER_AGENT_ASSIGNMENTS)!;
        return cors(await createAssignmentHardened(request, env, sessionUser!, agentId), request, env);
      }

      if (pathname === "/api/owner/unit-leaders" && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) return cors(json({ error: "Not authorized." }, 403), request, env);
        return cors(await createUnitLeaderHardened(request, env, sessionUser!), request, env);
      }

      if (OWNER_UNIT_LEADER_UNIT.test(pathname) && method === "PATCH") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) return cors(json({ error: "Not authorized." }, 403), request, env);
        const [, leaderId] = pathname.match(OWNER_UNIT_LEADER_UNIT)!;
        return cors(await reassignUnitLeaderHardened(request, env, sessionUser!, leaderId), request, env);
      }

      if (OWNER_PROPERTY_UNITS.test(pathname) && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) return cors(json({ error: "Not authorized." }, 403), request, env);
        const [, propertyId] = pathname.match(OWNER_PROPERTY_UNITS)!;
        const rejected = await guardCreateUnitOnActiveProperty(env, sessionUser!, propertyId);
        if (rejected) return cors(rejected, request, env);
        return coreWorker.fetch(request, env);
      }

      if ((pathname === "/api/owner/tenants" || pathname === "/api/agent/tenants") && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        const expectedRole = pathname.startsWith("/api/owner/") ? "OWNER" : "AGENT";
        if (!requireRole(sessionUser, [expectedRole])) return cors(json({ error: "Not authorized." }, 403), request, env);
        const rejected = await guardTenantTargetActive(request, env, sessionUser!);
        if (rejected) return cors(rejected, request, env);
        return coreWorker.fetch(request, env);
      }

      if (pathname === "/api/agent/properties" && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["AGENT"])) return cors(json({ error: "Not authorized." }, 403), request, env);
        return cors(await listAgentActiveProperties(env, sessionUser!), request, env);
      }

      // Deposit reads are normalized so the UI's "held" balance represents
      // refundable money actually paid, never non-refundable charges.
      if (OWNER_LEASE_DEPOSIT.test(pathname) && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) return cors(json({ error: "Not authorized." }, 403), request, env);
        const [, leaseId] = pathname.match(OWNER_LEASE_DEPOSIT)!;
        return cors(await getHardenedDeposit(env, sessionUser!, leaseId), request, env);
      }
      if (AGENT_LEASE_DEPOSIT.test(pathname) && method === "GET") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["AGENT"])) return cors(json({ error: "Not authorized." }, 403), request, env);
        const [, leaseId] = pathname.match(AGENT_LEASE_DEPOSIT)!;
        return cors(await getHardenedDeposit(env, sessionUser!, leaseId), request, env);
      }

      if (OWNER_DEPOSIT_ITEM_PAYMENTS.test(pathname) && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) return cors(json({ error: "Not authorized." }, 403), request, env);
        const [, itemId] = pathname.match(OWNER_DEPOSIT_ITEM_PAYMENTS)!;
        const rejected = await guardDepositPayment(request, env, sessionUser!, itemId);
        if (rejected) return cors(rejected, request, env);
        return coreWorker.fetch(request, env);
      }
      if (AGENT_DEPOSIT_ITEM_PAYMENTS.test(pathname) && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["AGENT"])) return cors(json({ error: "Not authorized." }, 403), request, env);
        const [, itemId] = pathname.match(AGENT_DEPOSIT_ITEM_PAYMENTS)!;
        const rejected = await guardDepositPayment(request, env, sessionUser!, itemId);
        if (rejected) return cors(rejected, request, env);
        return coreWorker.fetch(request, env);
      }

      if (OWNER_LEASE_DEPOSIT_DEDUCTIONS.test(pathname) && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) return cors(json({ error: "Not authorized." }, 403), request, env);
        const [, leaseId] = pathname.match(OWNER_LEASE_DEPOSIT_DEDUCTIONS)!;
        const rejected = await guardDepositDeduction(request, env, sessionUser!, leaseId);
        if (rejected) return cors(rejected, request, env);
        return coreWorker.fetch(request, env);
      }
      if (AGENT_LEASE_DEPOSIT_DEDUCTIONS.test(pathname) && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["AGENT"])) return cors(json({ error: "Not authorized." }, 403), request, env);
        const [, leaseId] = pathname.match(AGENT_LEASE_DEPOSIT_DEDUCTIONS)!;
        const rejected = await guardDepositDeduction(request, env, sessionUser!, leaseId);
        if (rejected) return cors(rejected, request, env);
        return coreWorker.fetch(request, env);
      }

      if (OWNER_LEASE_DEPOSIT_RETURNS.test(pathname) && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["OWNER"])) return cors(json({ error: "Not authorized." }, 403), request, env);
        const [, leaseId] = pathname.match(OWNER_LEASE_DEPOSIT_RETURNS)!;
        const rejected = await guardDepositReturn(request, env, sessionUser!, leaseId);
        if (rejected) return cors(rejected, request, env);
        return coreWorker.fetch(request, env);
      }
      if (AGENT_LEASE_DEPOSIT_RETURNS.test(pathname) && method === "POST") {
        const sessionUser = await resolveSession(request, env);
        if (!requireRole(sessionUser, ["AGENT"])) return cors(json({ error: "Not authorized." }, 403), request, env);
        const [, leaseId] = pathname.match(AGENT_LEASE_DEPOSIT_RETURNS)!;
        const rejected = await guardDepositReturn(request, env, sessionUser!, leaseId);
        if (rejected) return cors(rejected, request, env);
        return coreWorker.fetch(request, env);
      }

      // ---------------------------------------------------------------------
      // Smaller feature routes introduced after the original router.
      // ---------------------------------------------------------------------
      const isAdminRoute = pathname.startsWith("/api/admin/");
      const isTenantNotificationMutation = pathname === TENANT_NOTIFICATIONS_READ_ALL;
      const isOwnerAgreementRoute =
        pathname === "/api/owner/agreements" || OWNER_AGREEMENT_DOWNLOAD.test(pathname);

      if (!isAdminRoute && !isTenantNotificationMutation && !isOwnerAgreementRoute) {
        return coreWorker.fetch(request, env);
      }

      const sessionUser = await resolveSession(request, env);
      let response: Response;

      if (isTenantNotificationMutation) {
        if (!requireRole(sessionUser, ["TENANT"])) {
          response = json({ error: "Not authorized." }, 403);
        } else if (method === "POST") {
          response = await markMyNotificationsRead(env, sessionUser!);
        } else {
          response = json({ error: "Not found." }, 404);
        }
      } else if (isOwnerAgreementRoute) {
        if (!requireRole(sessionUser, ["OWNER"])) {
          response = json({ error: "Not authorized." }, 403);
        } else if (pathname === "/api/owner/agreements" && method === "GET") {
          response = await listOwnerAgreements(env, sessionUser!);
        } else if (OWNER_AGREEMENT_DOWNLOAD.test(pathname) && method === "GET") {
          const [, agreementId] = pathname.match(OWNER_AGREEMENT_DOWNLOAD)!;
          response = await downloadOwnerAgreement(env, sessionUser!, agreementId);
        } else {
          response = json({ error: "Not found." }, 404);
        }
      } else if (!requireRole(sessionUser, ["SUPER_ADMIN", "ADMIN"])) {
        response = json({ error: "Not authorized." }, 403);
      } else if (pathname === "/api/admin/users" && method === "GET") {
        response = await listUsers(env);
      } else if (pathname === "/api/admin/admins" && method === "POST") {
        response = await createAdminAccount(request, env, sessionUser!);
      } else if (ADMIN_RESET_PASSWORD.test(pathname) && method === "POST") {
        const [, userId] = pathname.match(ADMIN_RESET_PASSWORD)!;
        response = await initiatePasswordReset(env, sessionUser!, userId);
      } else if (ADMIN_USER_STATUS.test(pathname) && method === "PATCH") {
        const [, userId] = pathname.match(ADMIN_USER_STATUS)!;
        response = await setUserStatus(request, env, sessionUser!, userId);
      } else {
        response = json({ error: "Not found." }, 404);
      }

      return cors(response, request, env);
    } catch (err) {
      console.error(err);
      return cors(json({ error: "Internal server error." }, 500), request, env);
    }
  },
};
