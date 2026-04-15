const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3000/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });
  if (!response.ok) {
    let detail = "";
    try {
      const payload = (await response.json()) as { error?: string; message?: string };
      detail = payload?.error ?? payload?.message ?? "";
    } catch {
      detail = "";
    }
    throw new Error(detail || `Falha na chamada ${path}`);
  }
  return (await response.json()) as T;
}

export type Contract = {
  id: string;
  number: string;
  name: string;
  companyName: string;
  contractType: string;
  status: string;
  totalValue: string;
  monthlyValue: string;
  endDate: string;
  supplier?: { id: string; name: string; cnpj: string } | null;
  fiscal?: { id: string; name: string; email: string } | null;
  manager?: { id: string; name: string; email: string } | null;
  modules?: Array<{ id: string; name: string; weight: string; features: Array<{ id: string; name: string; status: string; weight: string }> }>;
  services?: Array<{ id: string; name: string; unit: string; unitValue: string }>;
};

export type Measurement = {
  id: string;
  contractId: string;
  referenceMonth: number;
  referenceYear: number;
  status: string;
  totalMeasuredValue: string;
  totalApprovedValue: string;
  totalGlosedValue: string;
  contract?: { id: string; number?: string; name: string };
  items?: Array<{ id: string; type: string; referenceId: string; quantity: string; calculatedValue: string }>;
  glosas?: Array<{ id: string; type: string; value: string; justification: string; createdBy: string; createdAt: string }>;
  attachments?: Array<{ id: string; fileName: string; filePath: string; createdAt: string }>;
};

export type Glosa = {
  id: string;
  measurementId: string;
  type: string;
  value: string;
  justification: string;
  createdBy: string;
  createdAt: string;
  measurement?: { id: string; referenceMonth: number; referenceYear: number; contract?: { number?: string; name: string } };
};

export type GovernanceTicket = {
  id: string;
  ticketId: string;
  status: string;
  priority?: string | null;
  type?: string | null;
  openedAt: string;
  acknowledgedAt?: string | null;
  slaDeadline?: string | null;
  resolvedAt?: string | null;
  managerNotified: boolean;
  controladoriaNotified: boolean;
  seiProcessNumber?: string | null;
  contract?: { id: string; number: string; name: string };
  eventLogs?: Array<{ id: string; type: string; description: string; createdAt: string }>;
  deadlineExtensions?: Array<{ id: string; previousDeadline: string; newDeadline: string; justification: string; createdBy: string; createdAt: string }>;
  watchers?: Array<{ id: string; userId: string; role: string }>;
};

export type Goal = {
  id: string;
  title: string;
  description?: string | null;
  year: number;
  status: string;
  priority: string;
  responsibleId: string;
  calculatedProgress?: number;
  actions?: Array<{ id: string; title: string; description?: string | null; status: string; progress: number; dueDate?: string | null; responsibleId: string }>;
  links?: Array<{ id: string; type: string; referenceId: string }>;
};

export type Supplier = {
  id: string;
  name: string;
  cnpj: string;
  contracts?: Array<{ id: string; number: string; name: string; status: string }>;
};

export type Fiscal = {
  id: string;
  name: string;
  email: string;
  phone: string;
  contractsAsFiscal?: Array<{ id: string; number: string; name: string; status: string }>;
  contractsAsManager?: Array<{ id: string; number: string; name: string; status: string }>;
};

export async function getDashboardSummary(): Promise<Record<string, unknown>> {
  return request("/dashboard/summary");
}

export async function getDashboardAlerts(): Promise<Record<string, unknown>> {
  return request("/dashboard/alerts");
}

export async function getContracts(): Promise<Contract[]> {
  return request("/contracts");
}

export async function getContract(id: string): Promise<Contract> {
  return request(`/contracts/${id}`);
}

export async function createContract(payload: {
  number: string;
  name: string;
  description?: string;
  companyName: string;
  cnpj: string;
  contractType: "SOFTWARE" | "DATACENTER" | "INFRA" | "SERVICO";
  lawType?: "LEI_8666" | "LEI_14133";
  startDate: string;
  endDate: string;
  totalValue?: number;
  monthlyValue: number;
  status?: "ACTIVE" | "EXPIRED" | "SUSPENDED";
  slaTarget?: number;
  fiscalId: string;
  managerId?: string;
  supplierId?: string;
}): Promise<Contract> {
  return request("/contracts", { method: "POST", body: JSON.stringify(payload) });
}

export async function getMeasurements(): Promise<Measurement[]> {
  return request("/measurements");
}

export async function createMeasurement(payload: {
  contractId: string;
  referenceMonth: number;
  referenceYear: number;
}): Promise<Measurement> {
  return request("/measurements", { method: "POST", body: JSON.stringify(payload) });
}

export async function getMeasurement(id: string): Promise<Measurement> {
  return request(`/measurements/${id}`);
}

export async function calculateMeasurement(id: string): Promise<Measurement> {
  return request(`/measurements/${id}/calculate`, { method: "POST", body: "{}" });
}

export async function approveMeasurement(id: string): Promise<Measurement> {
  return request(`/measurements/${id}/approve`, { method: "POST", body: "{}" });
}

export async function getGlosas(): Promise<Glosa[]> {
  return request("/glosas");
}

export async function createGlosa(payload: {
  measurementId: string;
  type: "ATRASO" | "NAO_ENTREGA" | "SLA" | "QUALIDADE";
  value: number;
  justification: string;
  createdBy?: string;
}): Promise<Glosa> {
  return request("/glosas", { method: "POST", body: JSON.stringify(payload) });
}

export async function getSuppliers(): Promise<Supplier[]> {
  return request("/suppliers");
}

export async function createSupplier(payload: { name: string; cnpj: string }): Promise<Supplier> {
  return request("/suppliers", { method: "POST", body: JSON.stringify(payload) });
}

export async function getFiscais(): Promise<Fiscal[]> {
  return request("/fiscais");
}

export async function createFiscal(payload: { name: string; email: string; phone: string }): Promise<Fiscal> {
  return request("/fiscais", { method: "POST", body: JSON.stringify(payload) });
}

export async function getGovernanceTickets(): Promise<GovernanceTicket[]> {
  return request("/governance/tickets");
}

export async function createGovernanceTicket(payload: {
  ticketId: string;
  contractId: string;
  openedAt?: string;
}): Promise<GovernanceTicket> {
  return request("/governance/tickets", { method: "POST", body: JSON.stringify(payload) });
}

export async function getGovernanceTicket(id: string): Promise<GovernanceTicket> {
  return request(`/governance/tickets/${id}`);
}

export async function runGovernanceMonitoring(): Promise<Record<string, number>> {
  return request("/governance/tickets/monitoring/run", { method: "POST", body: "{}" });
}

export async function extendGovernanceDeadline(
  id: string,
  payload: { newDeadline: string; justification: string; createdBy: string }
): Promise<GovernanceTicket> {
  return request(`/governance/tickets/${id}/extend-deadline`, { method: "POST", body: JSON.stringify(payload) });
}

export async function sendGovernanceToControladoria(
  id: string,
  payload: { seiProcessNumber: string; controladoriaUserId?: string }
): Promise<GovernanceTicket> {
  return request(`/governance/tickets/${id}/send-to-controladoria`, { method: "POST", body: JSON.stringify(payload) });
}

export async function acknowledgeGovernanceTicket(id: string, payload: { acknowledgedAt: string }): Promise<GovernanceTicket> {
  return request(`/governance/tickets/${id}/acknowledge`, { method: "POST", body: JSON.stringify(payload) });
}

export async function classifyGovernanceTicket(
  id: string,
  payload: { priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; type: "CORRETIVA" | "EVOLUTIVA" }
): Promise<GovernanceTicket> {
  return request(`/governance/tickets/${id}/classify`, { method: "POST", body: JSON.stringify(payload) });
}

export async function notifyGovernanceManager(id: string, payload: { managerNotified: boolean; description: string }): Promise<GovernanceTicket> {
  return request(`/governance/tickets/${id}/notify-manager`, { method: "POST", body: JSON.stringify(payload) });
}

export async function resolveGovernanceTicket(id: string, payload: { resolvedAt: string }): Promise<GovernanceTicket> {
  return request(`/governance/tickets/${id}/resolve`, { method: "POST", body: JSON.stringify(payload) });
}

export async function getGoals(): Promise<Goal[]> {
  return request("/goals");
}

export async function createGoal(payload: {
  title: string;
  description?: string;
  year: number;
  status?: "PLANNED" | "IN_PROGRESS" | "COMPLETED";
  priority?: string;
  responsibleId: string;
}): Promise<Goal> {
  return request("/goals", { method: "POST", body: JSON.stringify(payload) });
}

export async function getGoal(id: string): Promise<Goal> {
  return request(`/goals/${id}`);
}

export async function createGoalAction(
  id: string,
  payload: { title: string; description?: string; status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED"; progress: number; dueDate?: string; responsibleId: string }
): Promise<Record<string, unknown>> {
  return request(`/goals/${id}/actions`, { method: "POST", body: JSON.stringify(payload) });
}

export async function addGoalLink(id: string, payload: { type: "CONTRACT" | "TICKET"; referenceId: string }): Promise<Record<string, unknown>> {
  return request(`/goals/${id}/links`, { method: "POST", body: JSON.stringify(payload) });
}

export async function setManualGoalProgress(id: string, progress: number): Promise<Record<string, unknown>> {
  return request(`/goals/${id}/manual-progress`, { method: "POST", body: JSON.stringify({ progress }) });
}
