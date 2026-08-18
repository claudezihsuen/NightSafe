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

export interface OwnerUnit {
  id: string;
  label: string;
  monthly_rent: number; // cents
}

export interface OwnerProperty {
  id: string;
  name: string;
  address: string;
  units: OwnerUnit[];
}

export const DEPOSIT_TYPE_PRESETS = [
  "Rental Deposit",
  "Water Deposit",
  "Electricity Deposit",
  "Utility Deposit",
  "Key Deposit",
  "Access Card Deposit",
  "Parking Deposit",
  "Furniture Deposit",
  "Equipment Deposit",
] as const;

export interface DepositItem {
  id: string;
  lease_id: string;
  name: string;
  type: string;
  description: string | null;
  quantity: number;
  unit_amount: number; // cents
  total_amount: number; // cents
  currency: string;
  refundable: number; // 0 | 1
  notes: string | null; // absent entirely in the tenant-facing response
  created_at: string;
  amountPaid: number; // cents
  paymentStatus: "EXPECTED" | "PARTIALLY_PAID" | "FULLY_PAID";
}

export interface DepositDeduction {
  id: string;
  lease_id: string;
  deposit_item_id: string | null;
  name: string;
  amount: number; // cents
  reason: string;
  description: string | null;
  receipt_key: string | null;
  created_at: string;
}

export interface DepositReturn {
  id: string;
  lease_id: string;
  amount: number; // cents
  returned_at: string;
  notes: string | null;
  created_at: string;
}

export interface DepositSummary {
  depositStatus: "DRAFT" | "FINALIZED";
  finalizedAt: string | null;
  totalDeposit: number;
  totalRefundableDeposit: number;
  totalPaid: number;
  totalDeducted: number;
  totalReturned: number;
  amountHeld: number;
  remainingRefundable: number;
  paymentStatus: "EXPECTED" | "PARTIALLY_PAID" | "FULLY_PAID";
  refundStatus: "NOT_APPLICABLE" | "HELD" | "PARTIALLY_RETURNED" | "FULLY_RETURNED";
}

export interface DepositBreakdown {
  items: DepositItem[];
  deductions: DepositDeduction[];
  returns: DepositReturn[];
  summary: DepositSummary;
}

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}
