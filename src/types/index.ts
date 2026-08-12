import type { LucideIcon } from "lucide-react";

export type Role = "OWNER" | "AGENT" | "UNIT_LEADER" | "TENANT";

export type PaymentStatus =
  | "WAITING_PAYMENT"
  | "PENDING_REVIEW"
  | "PAYMENT_CONFIRMED"
  | "OVERDUE";

export type UtilityType = "WATER" | "ELECTRICITY";

// Used specifically by the tenant rent payment workflow — labels match
// the exact statuses required there ("Paid", "Waiting Payment", etc.),
// distinct from the WAITING_PAYMENT/PENDING_REVIEW styling elsewhere.
export type RentStatus = "PAID" | "WAITING_PAYMENT" | "PENDING" | "PAYMENT_CONFIRMED" | "REJECTED";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}
