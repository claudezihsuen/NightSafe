export type Role = "OWNER" | "AGENT" | "UNIT_LEADER" | "TENANT";

export interface Env {
  DB: D1Database;
  FILES: R2Bucket; // agreement/receipt uploads
  ENVIRONMENT?: string; // "development" | "production"
  FRONTEND_URL: string; // e.g. http://localhost:5173 or https://app.nightsafe.example
}

export interface UserRow {
  id: string;
  email: string;
  name: string;
  phone: string | null;
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
  role: Role;
  unitId: string | null;
}

export interface PropertyRow {
  id: string;
  owner_id: string;
  name: string;
  address: string;
  created_at: string;
}

export interface UnitRow {
  id: string;
  property_id: string;
  label: string;
  monthly_rent: number;
  created_at: string;
}
