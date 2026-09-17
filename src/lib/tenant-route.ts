import type { Role } from "@/types";

export function tenantAppBase(role: Role | undefined): "/tenant" | "/unit-leader" {
  return role === "UNIT_LEADER" ? "/unit-leader" : "/tenant";
}
