export type Role = "OWNER" | "AGENT" | "UNIT_LEADER" | "TENANT";

export interface Env {
  DB: D1Database;
  ENVIRONMENT?: string; // "development" | "production"
  FRONTEND_URL: string; // e.g. http://localhost:5173 or https://app.nightsafe.example
}

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  password_hash: string | null;
  status: "ACTIVE" | "PENDING";
  created_at: string;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}
