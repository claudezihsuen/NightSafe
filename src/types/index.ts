import type { LucideIcon } from "lucide-react";

export type Role = "SUPER_ADMIN" | "ADMIN" | "OWNER" | "AGENT" | "UNIT_LEADER" | "TENANT";
export type Language = "EN" | "ZH" | "TA";

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
  nickname: string | null;
  language: Language;
  phone: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  twoFactorEnabled: boolean;
  role: Role;
  unitId?: string | null;
}

export interface OwnerUnit {
  id: string;
  label: string;
  monthly_rent: number;
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
  unit_amount: number;
  total_amount: number;
  currency: string;
  refundable: number;
  notes: string | null;
  created_at: string;
  amountPaid: number;
  paymentStatus: "EXPECTED" | "PARTIALLY_PAID" | "FULLY_PAID";
}

export interface DepositDeduction {
  id: string;
  lease_id: string;
  deposit_item_id: string | null;
  name: string;
  amount: number;
  reason: string;
  description: string | null;
  receipt_key: string | null;
  created_at: string;
}

export interface DepositReturn {
  id: string;
  lease_id: string;
  amount: number;
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

export type DocumentStatus =
  | "REQUIRED"
  | "NOT_UPLOADED"
  | "UPLOADED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "ARCHIVED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "REVISION_REQUIRED";

export type DocumentFieldType = "TEXT" | "DATE" | "SIGNATURE" | "CHECKBOX" | "INITIALS";

export interface DocumentationItem {
  id: string;
  tenantId: string;
  leaseId: string;
  propertyId: string | null;
  unitId: string | null;
  name: string;
  category: string | null;
  description: string | null;
  fileName: string | null;
  fileType: string | null;
  fileSize: number | null;
  uploadedAt: string | null;
  updatedAt: string;
  status: DocumentStatus;
  tenantVisible: boolean;
  tenantDownload: boolean;
  tenantUpload: boolean;
  tenantCanEdit: boolean;
  tenantCanSign: boolean;
  required: boolean;
  expiryDate: string | null;
  allowedTypes: string[];
  maxFileSize: number;
  currentVersion: number;
  hasFile: boolean;
  archivedAt: string | null;
  createdAt: string;
  internalNotes?: string | null;
  uploadedBy?: string | null;
  tenantName?: string;
  tenantEmail?: string;
  propertyName?: string;
  unitLabel?: string;
}

export interface DocumentationTenancy {
  leaseId: string;
  status: string;
  startDate: string;
  endDate: string | null;
  tenantId: string;
  tenantName: string;
  tenantEmail: string;
  propertyId: string;
  propertyName: string;
  unitId: string;
  unitLabel: string;
}

export interface DocumentField {
  id: string;
  document_id: string;
  version_number: number;
  field_type: DocumentFieldType;
  label: string;
  required: number;
  assigned_role: "TENANT";
  page_number: number;
  x: number;
  y: number;
  width: number;
  height: number;
  sort_order: number;
}

export interface DocumentValue {
  field_id: string;
  value_text: string | null;
  value_checked: number | null;
  signature_key: string | null;
}

export interface NightSafeNotification {
  id: string;
  title: string;
  body: string;
  type: string | null;
  related_type: string | null;
  related_id: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
}

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}
