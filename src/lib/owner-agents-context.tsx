import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api, ApiError } from "@/lib/api";

export interface AgentAssignment {
  id: string;
  propertyId: string;
  propertyName: string;
  unitId: string | null;
  unitLabel: string | null;
}

export interface AgentRecord {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: "ACTIVE" | "WAITING_FOR_ACTIVATION" | "INACTIVE";
  assignments: AgentAssignment[];
}

interface ApiAssignment {
  id: string;
  property_id: string;
  property_name: string;
  unit_id: string | null;
  unit_label: string | null;
}

interface ApiAgent {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: AgentRecord["status"];
  assignments: ApiAssignment[];
}

function fromApi(a: ApiAgent): AgentRecord {
  return {
    id: a.id,
    name: a.name,
    email: a.email,
    phone: a.phone,
    status: a.status,
    assignments: a.assignments.map((s) => ({
      id: s.id,
      propertyId: s.property_id,
      propertyName: s.property_name,
      unitId: s.unit_id,
      unitLabel: s.unit_label,
    })),
  };
}

interface OwnerAgentsContextValue {
  agents: AgentRecord[];
  loading: boolean;
  error: string | null;
  getAgent: (id: string) => AgentRecord | undefined;
  refresh: () => Promise<void>;
  createAgent: (input: { name: string; email: string; phone?: string }) => Promise<{ inviteLink: string }>;
  activateAgent: (id: string) => Promise<void>;
  deactivateAgent: (id: string) => Promise<void>;
  createAssignment: (agentId: string, propertyId: string, unitId?: string) => Promise<void>;
  removeAssignment: (agentId: string, assignmentId: string) => Promise<void>;
}

const OwnerAgentsContext = createContext<OwnerAgentsContextValue | null>(null);

export function OwnerAgentsProvider({ children }: { children: ReactNode }) {
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<{ agents: ApiAgent[] }>("/api/owner/agents");
      setAgents(data.agents.map(fromApi));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load agents.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const getAgent = (id: string) => agents.find((a) => a.id === id);

  const createAgent: OwnerAgentsContextValue["createAgent"] = async (input) => {
    const data = await api.post<{ inviteLink: string }>("/api/owner/agents", input);
    await refresh();
    return data;
  };

  const activateAgent = async (id: string) => {
    await api.post(`/api/owner/agents/${id}/activate`);
    await refresh();
  };

  const deactivateAgent = async (id: string) => {
    await api.post(`/api/owner/agents/${id}/deactivate`);
    await refresh();
  };

  const createAssignment = async (agentId: string, propertyId: string, unitId?: string) => {
    await api.post(`/api/owner/agents/${agentId}/assignments`, { propertyId, unitId });
    await refresh();
  };

  const removeAssignment = async (agentId: string, assignmentId: string) => {
    await api.delete(`/api/owner/agents/${agentId}/assignments/${assignmentId}`);
    await refresh();
  };

  return (
    <OwnerAgentsContext.Provider
      value={{
        agents,
        loading,
        error,
        getAgent,
        refresh,
        createAgent,
        activateAgent,
        deactivateAgent,
        createAssignment,
        removeAssignment,
      }}
    >
      {children}
    </OwnerAgentsContext.Provider>
  );
}

export function useOwnerAgents(): OwnerAgentsContextValue {
  const ctx = useContext(OwnerAgentsContext);
  if (!ctx) throw new Error("useOwnerAgents must be used within OwnerAgentsProvider");
  return ctx;
}
