import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import type { OwnerProperty } from "@/types";

export interface AgentTenant {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  leaseId: string;
  propertyName: string;
  unitLabel: string;
}

interface ApiAgentTenant {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  lease_id: string;
  property_name: string;
  unit_label: string;
}

interface AgentContextValue {
  properties: OwnerProperty[];
  tenants: AgentTenant[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const AgentContext = createContext<AgentContextValue | null>(null);

export function AgentDataProvider({ children }: { children: ReactNode }) {
  const [properties, setProperties] = useState<OwnerProperty[]>([]);
  const [tenants, setTenants] = useState<AgentTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [propsData, tenantsData] = await Promise.all([
        api.get<{ properties: OwnerProperty[] }>("/api/agent/properties"),
        api.get<{ tenants: ApiAgentTenant[] }>("/api/agent/tenants"),
      ]);
      setProperties(propsData.properties);
      setTenants(
        tenantsData.tenants.map((t) => ({
          id: t.id,
          name: t.name,
          email: t.email,
          phone: t.phone,
          status: t.status,
          leaseId: t.lease_id,
          propertyName: t.property_name,
          unitLabel: t.unit_label,
        })),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load your assignments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <AgentContext.Provider value={{ properties, tenants, loading, error, refresh }}>
      {children}
    </AgentContext.Provider>
  );
}

export function useAgentData(): AgentContextValue {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error("useAgentData must be used within AgentDataProvider");
  return ctx;
}
