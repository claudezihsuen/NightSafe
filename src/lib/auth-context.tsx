import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import type { AuthUser } from "@/types";

export type LoginResult =
  | { user: AuthUser; twoFactorRequired?: false }
  | { twoFactorRequired: true; challenge: string };

interface AuthContextValue {
  user: AuthUser | null;
  status: "loading" | "authenticated" | "unauthenticated";
  login: (email: string, password: string, rememberMe?: boolean) => Promise<LoginResult>;
  verifyTwoFactor: (challenge: string, code: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthContextValue["status"]>("loading");

  const refresh = useCallback(async () => {
    try {
      // The server is the source of truth for who's logged in — the session
      // lives in an HTTP-only cookie, never in localStorage or a JS-readable token.
      const data = await api.get<{ user: AuthUser | null }>("/api/auth/me");
      setUser(data.user);
      setStatus(data.user ? "authenticated" : "unauthenticated");
    } catch {
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string, rememberMe = false): Promise<LoginResult> => {
    const data = await api.post<LoginResult>("/api/auth/login", { email, password, rememberMe });
    if ("user" in data) {
      setUser(data.user);
      setStatus("authenticated");
    }
    return data;
  }, []);

  const verifyTwoFactor = useCallback(async (challenge: string, code: string) => {
    const data = await api.post<{ user: AuthUser }>("/api/auth/2fa", { challenge, code });
    setUser(data.user);
    setStatus("authenticated");
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/api/auth/logout");
    } catch {
      // Even if the request fails, clear local state so the UI reflects logged-out.
    }
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  return (
    <AuthContext.Provider value={{ user, status, login, verifyTwoFactor, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { ApiError };
