import type { LucideIcon } from "lucide-react";

export type Role = "OWNER" | "AGENT" | "UNIT_LEADER" | "TENANT";

export type PaymentStatus =
  | "WAITING_PAYMENT"
  | "PENDING_REVIEW"
  | "PAYMENT_CONFIRMED"
  | "OVERDUE";

export type UtilityType = "WATER" | "ELECTRICITY";

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
