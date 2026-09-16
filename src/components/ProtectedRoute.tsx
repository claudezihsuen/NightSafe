import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import type { Role } from "@/types";

const ROLE_HOME: Record<Role, string> = {
  ADMIN: "/admin",
  OWNER: "/owner",
  AGENT: "/agent",
  UNIT_LEADER: "/unit-leader",
  TENANT: "/tenant",
};

interface ProtectedRouteProps {
  allowedRoles: Role[];
  children: React.ReactNode;
}

export function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
  const { user, status } = useAuth();

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-sage-300 border-t-sage-600" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to={ROLE_HOME[user.role]} replace />;
  }

  return <>{children}</>;
}
