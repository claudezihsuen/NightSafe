export type Role = "SUPER_ADMIN" | "ADMIN" | "OWNER" | "AGENT" | "UNIT_LEADER" | "TENANT";
export type Language = "EN" | "ZH" | "TA";

export interface Env {
  DB: D1Database;
  FILES: R2Bucket; // agreement/receipt uploads
  ENVIRONMENT?: string; // "development" | "staging" | "production"
  FRONTEND_URL: string; // e.g. http://localhost:5173 or https://nightsafe.pages.dev
  RESEND_API_KEY?: string; // optional transactional-email provider key
  EMAIL_FROM?: string; // verified sender, e.g. NightSafe <no-reply@example.com>
}

export interface UserRow {
  id: string;
  email: string;
  name: string;
  nickname: string | null;
  language: Language;
  email_verified_at: string | null;
  phone: string | null;
  phone_verified_at: string | null;
  two_factor_secret: string | null;
  two_factor_pending_secret: string | null;
  two_factor_enabled_at: string | null;
  role: Role;
  password_hash: string | null;
  status: "ACTIVE" | "WAITING_FOR_ACTIVATION" | "INACTIVE";
  created_by: string | null;
  unit_id: string | null; // Unit Leader's assigned unit; null for other roles
  created_at: string;
}

export interface SessionUser {
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
  unitId: string | null;
}

export interface PropertyRow {
  id: string;
  owner_id: string;
  name: string;
  address: string;
  archived_at: string | null;
  created_at: string;
}

export interface UnitRow {
  id: string;
  property_id: string;
  label: string;
  monthly_rent: number;
  archived_at: string | null;
  created_at: string;
}
