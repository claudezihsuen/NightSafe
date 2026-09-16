import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import type { Role } from "@/types";

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: Role;
  status: "ACTIVE" | "WAITING_FOR_ACTIVATION" | "INACTIVE";
  createdAt: string;
}

interface ApiAdminUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: Role;
  status: AdminUser["status"];
  created_at: string;
}

interface CreateAdminResponse {
  user: Omit<ApiAdminUser, "created_at">;
  activationLink: string;
  expiresAt: string;
}

function fromApi(u: ApiAdminUser): AdminUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    phone: u.phone,
    role: u.role,
    status: u.status,
    createdAt: u.created_at,
  };
}

interface AdminContextValue {
  users: AdminUser[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createAdmin: (input: { name: string; email: string; phone?: string }) => Promise<{ activationLink: string; expiresAt: string }>;
  resetPassword: (userId: string) => Promise<{ resetLink: string; expiresAt: string }>;
  setStatus: (userId: string, status: "ACTIVE" | "INACTIVE") => Promise<void>;
}

const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<{ users: ApiAdminUser[] }>("/api/admin/users");
      setUsers(data.users.map(fromApi));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load accounts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createAdmin = async (input: { name: string; email: string; phone?: string }) => {
    const result = await api.post<CreateAdminResponse>("/api/admin/admins", input);
    await refresh();
    return { activationLink: result.activationLink, expiresAt: result.expiresAt };
  };

  const resetPassword = async (userId: string) => {
    return api.post<{ resetLink: string; expiresAt: string }>(`/api/admin/users/${userId}/reset-password`);
  };

  const setStatus = async (userId: string, status: "ACTIVE" | "INACTIVE") => {
    await api.patch(`/api/admin/users/${userId}/status`, { status });
    await refresh();
  };

  return (
    <AdminContext.Provider value={{ users, loading, error, refresh, createAdmin, resetPassword, setStatus }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used within AdminProvider");
  return ctx;
}
