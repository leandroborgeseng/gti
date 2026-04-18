import { authHeadersForApi, readBrowserAuthToken } from "@/lib/auth-token";

/**
 * Base da API de gestão (`.../api`), sem obrigar `NEXT_PUBLIC_BACKEND_URL`.
 * Por omissão: mesmo host que a app Next (`/api/...` no browser; cabeçalhos `Host` no servidor).
 */
export function getBackendApiBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_BACKEND_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/+$/, "");
  }
  if (typeof window !== "undefined") {
    return `${window.location.origin}/api`;
  }
  return "";
}

async function resolveRequestApiBase(): Promise<string> {
  const fromEnv = process.env.NEXT_PUBLIC_BACKEND_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/+$/, "");
  }
  if (typeof window !== "undefined") {
    return `${window.location.origin}/api`;
  }
  const { headers } = await import("next/headers");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = (h.get("x-forwarded-proto") ?? "http").split(",")[0]?.trim() || "http";
  if (host) {
    return `${proto}://${host}/api`.replace(/\/+$/, "");
  }
  return "http://127.0.0.1:4000/api";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const apiBase = await resolveRequestApiBase();
  const auth = await authHeadersForApi();
  const isFormData = init?.body instanceof FormData;
  const extra = (init?.headers ?? {}) as Record<string, string>;
  const headers: Record<string, string> = { ...auth, ...extra };
  if (!isFormData && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }
  const pathPart = path.startsWith("/") ? path : `/${path}`;
  const response = await fetch(`${apiBase}${pathPart}`, {
    ...init,
    headers,
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

export type ContractAmendment = {
  id: string;
  contractId: string;
  referenceCode?: string | null;
  effectiveDate: string;
  description: string;
  previousTotalValue: string;
  previousMonthlyValue: string;
  previousEndDate: string;
  newTotalValue: string;
  newMonthlyValue: string;
  newEndDate: string;
  createdAt: string;
};

export type Contract = {
  id: string;
  number: string;
  name: string;
  description?: string | null;
  companyName: string;
  cnpj?: string;
  contractType: string;
  lawType?: string;
  status: string;
  totalValue: string;
  monthlyValue: string;
  startDate: string;
  endDate: string;
  slaTarget?: string | null;
  updatedAt?: string;
  supplier?: { id: string; name: string; cnpj: string } | null;
  fiscal?: { id: string; name: string; email: string } | null;
  manager?: { id: string; name: string; email: string } | null;
  modules?: Array<{ id: string; name: string; weight: string; features: Array<{ id: string; name: string; status: string; weight: string }> }>;
  services?: Array<{ id: string; name: string; unit: string; unitValue: string }>;
  amendments?: ContractAmendment[];
  /** Presente na listagem (`GET /contracts`) para indicar quantos aditivos existem. */
  _count?: { amendments: number };
};

export type AttachmentRecord = {
  id: string;
  fileName: string;
  mimeType: string;
  filePath: string;
  createdAt: string;
};

export type Measurement = {
  id: string;
  contractId: string;
  referenceMonth: number;
  referenceYear: number;
  status: string;
  /** ISO; útil para alinhar estado cliente após revalidação do servidor. */
  updatedAt?: string;
  totalMeasuredValue: string;
  totalApprovedValue: string;
  totalGlosedValue: string;
  contract?: {
    id: string;
    number?: string;
    name: string;
    contractType?: string;
    services?: Array<{ id: string; name: string; unit: string; unitValue: string }>;
  };
  items?: Array<{ id: string; type: string; referenceId: string; quantity: string; calculatedValue: string }>;
  glosas?: Array<{ id: string; type: string; value: string; justification: string; createdBy: string; createdAt: string }>;
  attachments?: Array<AttachmentRecord>;
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
  attachments?: Array<AttachmentRecord>;
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

export async function createContractAmendment(
  contractId: string,
  payload: {
    referenceCode?: string;
    effectiveDate: string;
    description: string;
    newTotalValue: number;
    newMonthlyValue: number;
    newEndDate: string;
  }
): Promise<Contract> {
  return request(`/contracts/${contractId}/amendments`, { method: "POST", body: JSON.stringify(payload) });
}

export async function updateContract(
  contractId: string,
  payload: {
    status?: "ACTIVE" | "EXPIRED" | "SUSPENDED";
    name?: string;
    description?: string | null;
    companyName?: string;
    cnpj?: string;
    contractType?: "SOFTWARE" | "DATACENTER" | "INFRA" | "SERVICO";
    lawType?: "LEI_8666" | "LEI_14133";
    startDate?: string;
    endDate?: string;
    totalValue?: number;
    monthlyValue?: number;
    slaTarget?: number | null;
    fiscalId?: string;
    managerId?: string;
    supplierId?: string | null;
  }
): Promise<Contract> {
  return request(`/contracts/${contractId}`, { method: "PUT", body: JSON.stringify(payload) });
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

export type ContractFeatureStatus = "NOT_STARTED" | "IN_PROGRESS" | "DELIVERED" | "VALIDATED";

export async function createContractModule(contractId: string, payload: { name: string; weight: number }): Promise<Contract> {
  return request(`/contracts/${contractId}/modules`, { method: "POST", body: JSON.stringify(payload) });
}

export async function updateContractModule(
  contractId: string,
  moduleId: string,
  payload: { name?: string; weight?: number }
): Promise<Contract> {
  return request(`/contracts/${contractId}/modules/${moduleId}`, { method: "PUT", body: JSON.stringify(payload) });
}

export async function deleteContractModule(contractId: string, moduleId: string): Promise<Contract> {
  return request(`/contracts/${contractId}/modules/${moduleId}`, { method: "DELETE" });
}

export async function createContractFeature(
  contractId: string,
  moduleId: string,
  payload: { name: string; weight: number; status?: ContractFeatureStatus }
): Promise<Contract> {
  return request(`/contracts/${contractId}/modules/${moduleId}/features`, { method: "POST", body: JSON.stringify(payload) });
}

export async function updateContractFeature(
  contractId: string,
  moduleId: string,
  featureId: string,
  payload: { name?: string; weight?: number; status?: ContractFeatureStatus }
): Promise<Contract> {
  return request(`/contracts/${contractId}/modules/${moduleId}/features/${featureId}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function deleteContractFeature(contractId: string, moduleId: string, featureId: string): Promise<Contract> {
  return request(`/contracts/${contractId}/modules/${moduleId}/features/${featureId}`, { method: "DELETE" });
}

export async function createContractService(
  contractId: string,
  payload: { name: string; unit: string; unitValue: number }
): Promise<Contract> {
  return request(`/contracts/${contractId}/services`, { method: "POST", body: JSON.stringify(payload) });
}

export async function updateContractService(
  contractId: string,
  serviceId: string,
  payload: { name?: string; unit?: string; unitValue?: number }
): Promise<Contract> {
  return request(`/contracts/${contractId}/services/${serviceId}`, { method: "PUT", body: JSON.stringify(payload) });
}

export async function deleteContractService(contractId: string, serviceId: string): Promise<Contract> {
  return request(`/contracts/${contractId}/services/${serviceId}`, { method: "DELETE" });
}

/** Download same-origin com cookie de sessão (evita expor JWT na URL do Nest). */
export function attachmentDownloadUrl(attachmentId: string): string {
  return `/api/attachments/${attachmentId}/download`;
}

async function parseUploadError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { message?: string | string[]; error?: string };
    const m = payload.message;
    if (Array.isArray(m)) {
      return m.join("; ");
    }
    return (typeof m === "string" ? m : payload.error) || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

export async function uploadMeasurementAttachment(measurementId: string, file: File): Promise<AttachmentRecord> {
  const form = new FormData();
  form.append("file", file);
  const t = readBrowserAuthToken();
  const headers: HeadersInit = t ? { Authorization: `Bearer ${t}` } : {};
  const apiBase = await resolveRequestApiBase();
  const response = await fetch(`${apiBase}/measurements/${measurementId}/attachments`, {
    method: "POST",
    headers,
    body: form,
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(await parseUploadError(response));
  }
  return (await response.json()) as AttachmentRecord;
}

export async function uploadGlosaAttachment(glosaId: string, file: File): Promise<AttachmentRecord> {
  const form = new FormData();
  form.append("file", file);
  const t = readBrowserAuthToken();
  const headers: HeadersInit = t ? { Authorization: `Bearer ${t}` } : {};
  const apiBase = await resolveRequestApiBase();
  const response = await fetch(`${apiBase}/glosas/${glosaId}/attachments`, {
    method: "POST",
    headers,
    body: form,
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(await parseUploadError(response));
  }
  return (await response.json()) as AttachmentRecord;
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

export async function addMeasurementServiceLines(
  measurementId: string,
  items: Array<{ type: "SERVICE"; referenceId: string; quantity: number }>
): Promise<Measurement> {
  return request(`/measurements/${measurementId}/items`, { method: "POST", body: JSON.stringify({ items }) });
}

export async function deleteMeasurementItem(measurementId: string, itemId: string): Promise<Measurement> {
  return request(`/measurements/${measurementId}/items/${itemId}`, { method: "DELETE" });
}

export async function patchMeasurementItemQuantity(
  measurementId: string,
  itemId: string,
  quantity: number
): Promise<Measurement> {
  return request(`/measurements/${measurementId}/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({ quantity })
  });
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

export async function getGlosa(id: string): Promise<Glosa> {
  return request(`/glosas/${id}`);
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

export type AuthMe = { id: string; email: string; role: string };

export async function getAuthMe(): Promise<AuthMe> {
  return request("/auth/me");
}

export type UserRecord = {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  updatedAt: string;
};

export async function getUsers(): Promise<UserRecord[]> {
  return request("/users");
}

export async function createUser(payload: {
  email: string;
  password: string;
  role?: "ADMIN" | "EDITOR" | "VIEWER";
}): Promise<UserRecord> {
  return request("/users", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateUser(
  id: string,
  payload: { role?: "ADMIN" | "EDITOR" | "VIEWER"; password?: string }
): Promise<UserRecord> {
  return request(`/users/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

/** Descarrega CSV de contratos (UTF-8 com BOM); requer papel ADMIN ou EDITOR. */
async function fetchExportCsvBlob(path: string, label: string): Promise<Blob> {
  const apiBase = await resolveRequestApiBase();
  const auth = await authHeadersForApi();
  const res = await fetch(`${apiBase}${path}`, { headers: { ...auth }, cache: "no-store" });
  if (!res.ok) {
    let detail = "";
    try {
      const payload = (await res.json()) as { message?: string | string[]; error?: string };
      const m = payload.message;
      detail = (Array.isArray(m) ? m.join("; ") : m) || payload.error || "";
    } catch {
      detail = "";
    }
    throw new Error(detail || `Falha ao exportar ${label} (${res.status})`);
  }
  return res.blob();
}

export async function fetchContractsCsvBlob(): Promise<Blob> {
  return fetchExportCsvBlob("/exports/contracts.csv", "contratos");
}

export async function fetchMeasurementsCsvBlob(): Promise<Blob> {
  return fetchExportCsvBlob("/exports/measurements.csv", "medições");
}

export async function fetchGlosasCsvBlob(): Promise<Blob> {
  return fetchExportCsvBlob("/exports/glosas.csv", "glosas");
}

export async function fetchContractAmendmentsCsvBlob(): Promise<Blob> {
  return fetchExportCsvBlob("/exports/contract-amendments.csv", "aditivos de contratos");
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
