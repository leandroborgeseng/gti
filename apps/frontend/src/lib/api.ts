import { authHeadersForApi, readBrowserAuthToken } from "@/lib/auth-token";
import { backendFetchAbortSignal } from "@/lib/backend-fetch-timeout";
import { normalizeBackendApiBaseUrl } from "@/lib/normalize-backend-api-url";
import type { MondayImportPayload } from "@/lib/monday-xlsx-import";

export type { MondayImportPayload };

function hostnameFromHostHeader(hostHeader: string | null): string | null {
  if (!hostHeader) return null;
  const first = hostHeader.split(",")[0]?.trim();
  if (!first) return null;
  try {
    return new URL(`http://${first}`).hostname.toLowerCase();
  } catch {
    return first.split(":")[0]?.toLowerCase() ?? null;
  }
}

function envBackendHostname(normalizedBase: string): string | null {
  const raw = normalizedBase.trim();
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withScheme).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Em SSR, `fetch` para o domínio público da própria app (Railway) pode bloquear ou estourar timeout
 * (pedido aninhado ao mesmo serviço). A API de gestão vive no mesmo processo Next → loopback.
 */
function loopbackGestaoApiBase(incoming: Headers): string {
  const hostHeader = incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "";
  const firstHost = hostHeader.split(",")[0]?.trim() ?? "";
  let portFromHeader = "";
  if (firstHost && !firstHost.startsWith("[")) {
    const parts = firstHost.split(":");
    if (parts.length > 1) {
      const last = parts[parts.length - 1] ?? "";
      if (/^\d+$/.test(last)) portFromHeader = last;
    }
  }
  const port = process.env.PORT?.trim() || portFromHeader || "3000";
  return normalizeBackendApiBaseUrl(`http://127.0.0.1:${port}/api`);
}

/**
 * Base da API de gestão (`.../api`). A lógica de negócio roda nas Route Handlers do Next
 * (`app/api/[...path]`). Opcional: `NEXT_PUBLIC_BACKEND_URL` se a API estiver noutro domínio.
 */
export function getBackendApiBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_BACKEND_URL?.trim();
  if (fromEnv) {
    return normalizeBackendApiBaseUrl(fromEnv);
  }
  if (typeof window !== "undefined") {
    return `${window.location.origin}/api`;
  }
  return "";
}

async function resolveRequestApiBase(): Promise<string> {
  if (typeof window !== "undefined") {
    const pub = process.env.NEXT_PUBLIC_BACKEND_URL?.trim();
    if (pub) return normalizeBackendApiBaseUrl(pub);
    return `${window.location.origin}/api`;
  }

  const explicit =
    process.env.BACKEND_API_BASE_URL?.trim() ||
    process.env.SERVER_API_BASE_URL?.trim();
  if (explicit) {
    return normalizeBackendApiBaseUrl(explicit);
  }

  const { headers } = await import("next/headers");
  const h = await headers();
  const requestHost = hostnameFromHostHeader(h.get("x-forwarded-host") ?? h.get("host"));

  const pub = process.env.NEXT_PUBLIC_BACKEND_URL?.trim();
  if (pub) {
    const normalized = normalizeBackendApiBaseUrl(pub);
    const envHost = envBackendHostname(normalized);
    if (envHost && requestHost && envHost === requestHost) {
      return loopbackGestaoApiBase(h);
    }
    return normalized;
  }

  return loopbackGestaoApiBase(h);
}

function formatFetchError(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const parts = [e.message];
  const c = e.cause;
  if (c !== undefined && c !== null) {
    parts.push(c instanceof Error ? c.message : String(c));
  }
  return parts.filter(Boolean).join(" — ");
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
  let response: Response;
  try {
    const signal = backendFetchAbortSignal(init?.signal ?? null);
    response = await fetch(`${apiBase}${pathPart}`, {
      ...init,
      headers,
      signal,
      cache: "no-store"
    });
  } catch (e) {
    throw new Error(formatFetchError(e));
  }
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

export type ContractFinancialSnapshot = {
  id: string;
  contractId: string;
  recordedAt: string;
  monthlyValue: string;
  totalValue: string;
  installationValue?: string | null;
  note?: string | null;
};

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

export type ContractGlpiGroup = {
  id: string;
  contractId: string;
  glpiGroupId: number;
  glpiGroupName: string | null;
  createdAt: string;
};

/** Estado de entrega do item (funcionalidade) para acompanhar a prestação do contrato. */
export type ContractItemDeliveryStatus = "NOT_DELIVERED" | "PARTIALLY_DELIVERED" | "DELIVERED";
export type ContractItemCriticality = "CRITICA" | "ALTA" | "MEDIA" | "BAIXA" | "APOIO";

/**
 * Proporção do valor mensal com base no progresso de entrega: «Entregue» = 1, «Parcialmente entregue» = 0,5,
 * «Não entregue» = 0; (soma dos pesos / total de itens em módulos) × valor mensal.
 */
export type BillingPhase = "UNDEFINED" | "PRE_IMPLEMENTATION" | "IMPLEMENTATION" | "MONTHLY";

export type FeatureImplantationProportion = {
  applicable: boolean;
  totalFeatures: number;
  implantedCount: number;
  partialCount: number;
  notDeliveredCount: number;
  ratioImplanted: number | null;
  ratioImplantedPercent: string | null;
  contractMonthlyValue: string;
  proportionalMonthlyValue: string | null;
  contractInstallationValue: string | null;
  proportionalInstallationValue: string | null;
  implementationPeriodStart: string | null;
  implementationPeriodEnd: string | null;
  billingPhase: BillingPhase;
  billingEmphasis: "INSTALLATION" | "MONTHLY" | "BOTH";
  explanation: string | null;
};

export type Contract = {
  id: string;
  number: string;
  name: string;
  description?: string | null;
  /** Secretaria ou unidade gestora (ex.: quadro de sistemas terceirizados). */
  managingUnit?: string | null;
  companyName: string;
  cnpj?: string;
  contractType: string;
  lawType?: string;
  status: string;
  totalValue: string;
  monthlyValue: string;
  /** Valor de implantação (único), separado da mensalidade. */
  installationValue?: string | null;
  /** Início do período em que a rubrica de implantação é a referência principal (AAAA-MM-DD). */
  implementationPeriodStart?: string | null;
  /** Fim do período de implantação (AAAA-MM-DD). */
  implementationPeriodEnd?: string | null;
  startDate: string;
  endDate: string;
  slaTarget?: string | null;
  updatedAt?: string;
  supplier?: { id: string; name: string; cnpj: string } | null;
  fiscal?: { id: string; name: string; email: string } | null;
  manager?: { id: string; name: string; email: string } | null;
  /** Grupos de trabalho GLPI associados ao contrato (métricas de SLA). */
  glpiGroups?: ContractGlpiGroup[];
  modules?: Array<{
    id: string;
    name: string;
    criticality?: ContractItemCriticality;
    validatorId?: string | null;
    validator?: { id: string; email: string; role: string } | null;
    weight: string;
    features: Array<{
      id: string;
      itemCode?: string | null;
      name: string;
      criticality?: ContractItemCriticality;
      status: string;
      weight: string;
      deliveryStatus?: ContractItemDeliveryStatus;
    }>;
  }>;
  services?: Array<{ id: string; name: string; unit: string; unitValue: string }>;
  amendments?: ContractAmendment[];
  /** Presente na listagem (`GET /contracts`) para indicar quantos aditivos existem. */
  _count?: { amendments: number };
  /** Indicador: valor mensal × (funcionalidades entregues / total em módulos). */
  featureImplantationProportion?: FeatureImplantationProportion;
  /** Memória dos valores antes de renovações ou reajustes (mais recente primeiro). */
  financialSnapshots?: ContractFinancialSnapshot[];
  /** Histórico auditável de inserção, exclusão e mudança de status dos itens contratuais. */
  itemChangeLogs?: ContractItemChangeLog[];
};

export type ContractItemChangeLog = {
  id: string;
  contractId: string;
  itemType: "MODULE" | "FEATURE" | "SERVICE";
  itemId?: string | null;
  itemName: string;
  action: "CREATED" | "DELETED" | "STATUS_CHANGED" | "UPDATED" | "BULK_IMPORTED";
  criticalityBefore?: string | null;
  criticalityAfter?: string | null;
  statusBefore?: string | null;
  statusAfter?: string | null;
  deliveryStatusBefore?: string | null;
  deliveryStatusAfter?: string | null;
  actorId?: string | null;
  actorLabel?: string | null;
  changedAt: string;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
};

export type GlpiAssignedGroupOption = {
  glpiGroupId: number;
  glpiGroupName: string | null;
};

export async function getGlpiAssignedGroupsCatalog(): Promise<GlpiAssignedGroupOption[]> {
  return request("/contracts/catalog/glpi-assigned-groups");
}

/** Linha de visão geral da página «Módulos» (contratos com estrutura modular). */
export type ContractModulesDeliveryOverview = {
  id: string;
  number: string;
  name: string;
  contractType: string;
  status: string;
  monthlyValue?: string;
  fiscal?: Pick<Fiscal, "id" | "name" | "email"> | null;
  manager?: Pick<Fiscal, "id" | "name" | "email"> | null;
  featureImplantationProportion?: FeatureImplantationProportion;
  modules: Array<{
    id: string;
    name: string;
    criticality: ContractItemCriticality;
    validatorId?: string | null;
    validator?: { id: string; email: string; role: string } | null;
    weight: unknown;
    features: Array<{
      id: string;
      itemCode?: string | null;
      name: string;
      weight: unknown;
      status: string;
      criticality: ContractItemCriticality;
      deliveryStatus: ContractItemDeliveryStatus;
    }>;
  }>;
};

export async function getModulesDeliveryOverview(): Promise<ContractModulesDeliveryOverview[]> {
  return request("/contracts/overview/modules-delivery");
}

export type ContractModuleValidator = { id: string; email: string; role: string };

export async function getContractModuleValidators(): Promise<ContractModuleValidator[]> {
  return request("/contracts/module-validators");
}

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
  projectId?: string | null;
  project?: { id: string; name: string } | null;
  calculatedProgress?: number;
  actions?: Array<{ id: string; title: string; description?: string | null; status: string; progress: number; dueDate?: string | null; responsibleId: string }>;
  projectTasks?: Array<{
    id: string;
    projectId: string;
    title: string;
    status: string;
    glpiTicketId?: number | null;
    dueDate?: string | null;
    project?: { id: string; name: string };
  }>;
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
  userId?: string | null;
  user?: { id: string; email: string; role: string } | null;
  contractsAsFiscal?: Array<{ id: string; number: string; name: string; status: string }>;
  contractsAsManager?: Array<{ id: string; number: string; name: string; status: string }>;
};

export type FiscalUserOption = { id: string; email: string; role: string };

export async function getDashboardSummary(): Promise<Record<string, unknown>> {
  return request("/dashboard/summary");
}

export async function getDashboardAlerts(): Promise<Record<string, unknown>> {
  return request("/dashboard/alerts");
}

export type OperationalSummaryPreset = "today" | "yesterday" | "week" | "month";

export type OperationalSummaryEvent = {
  id: string;
  type: string;
  category: string;
  entity: string;
  entityId?: string | null;
  title: string;
  description?: string | null;
  actorLabel?: string | null;
  occurredAt: string;
  metadata?: unknown;
};

export type OperationalSummaryTicket = {
  glpiTicketId: number;
  title?: string | null;
  status?: string | null;
  assignedUserName?: string | null;
  contractGroupName?: string | null;
  occurredAt?: string | null;
};

export type OperationalSummary = {
  period: { preset: string; from: string; to: string };
  totals: {
    openedTickets: number;
    closedTickets: number;
    completedTasks: number;
    contractChanges: number;
    totalEvents: number;
  };
  eventsByCategory: Record<string, number>;
  openedTickets: OperationalSummaryTicket[];
  closedTickets: OperationalSummaryTicket[];
  events: OperationalSummaryEvent[];
};

export async function getOperationalSummary(params: {
  preset?: OperationalSummaryPreset;
  from?: string;
  to?: string;
} = {}): Promise<OperationalSummary> {
  const sp = new URLSearchParams();
  if (params.preset) sp.set("preset", params.preset);
  if (params.from) sp.set("from", params.from);
  if (params.to) sp.set("to", params.to);
  const query = sp.toString();
  return request(`/operational-summary${query ? `?${query}` : ""}`);
}

/** Linha do relatório de fechamento mensal (medições + OS GLPI por contrato). */
export type MonthlyContractClosureRow = {
  contractId: string;
  contractNumber: string;
  contractName: string;
  contractStatus: string;
  contractTotalValue: string;
  contractMonthlyValue: string;
  contractInstallationValue: string | null;
  implementationPeriodStart: string | null;
  implementationPeriodEnd: string | null;
  previousMonthApprovedPayment: string | null;
  measurementStatus: string | null;
  monthApprovedPayment: string | null;
  monthMeasuredValue: string | null;
  glpiOsOpenedInMonth: number;
  glpiOsClosedInMonth: number;
  glpiOsOpenBacklog: number;
};

export async function getMonthlyContractClosureReport(year: number, month: number): Promise<MonthlyContractClosureRow[]> {
  const y = encodeURIComponent(String(year));
  const m = encodeURIComponent(String(month));
  return request(`/reports/monthly-contract-closure?year=${y}&month=${m}`);
}

export async function getContracts(): Promise<Contract[]> {
  return request("/contracts");
}

export async function getContract(id: string): Promise<Contract> {
  return request(`/contracts/${id}`);
}

export async function createContractFinancialSnapshot(
  contractId: string,
  payload?: { note?: string }
): Promise<Contract> {
  return request(`/contracts/${contractId}/financial-snapshots`, {
    method: "POST",
    body: JSON.stringify(payload ?? {})
  });
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
    number?: string;
    status?: "ACTIVE" | "EXPIRED" | "SUSPENDED";
    name?: string;
    description?: string | null;
    managingUnit?: string | null;
    companyName?: string;
    cnpj?: string;
    contractType?: "SOFTWARE" | "DATACENTER" | "INFRA" | "SERVICO";
    lawType?: "LEI_8666" | "LEI_14133";
    startDate?: string;
    endDate?: string;
    totalValue?: number;
    monthlyValue?: number;
    installationValue?: number | null;
    implementationPeriodStart?: string | null;
    implementationPeriodEnd?: string | null;
    slaTarget?: number | null;
    fiscalId?: string;
    managerId?: string;
    supplierId?: string | null;
    /** Se enviado (incluindo lista vazia), substitui todos os vínculos a grupos GLPI. */
    glpiGroups?: Array<{ glpiGroupId: number; glpiGroupName?: string }>;
  }
): Promise<Contract> {
  return request(`/contracts/${contractId}`, { method: "PUT", body: JSON.stringify(payload) });
}

export async function createContract(payload: {
  number: string;
  name: string;
  description?: string;
  managingUnit?: string;
  companyName: string;
  cnpj: string;
  contractType: "SOFTWARE" | "DATACENTER" | "INFRA" | "SERVICO";
  lawType?: "LEI_8666" | "LEI_14133";
  startDate: string;
  endDate: string;
  totalValue?: number;
  monthlyValue: number;
  installationValue?: number | null;
  implementationPeriodStart?: string;
  implementationPeriodEnd?: string;
  status?: "ACTIVE" | "EXPIRED" | "SUSPENDED";
  slaTarget?: number;
  fiscalId: string;
  managerId?: string;
  supplierId?: string;
  glpiGroups?: Array<{ glpiGroupId: number; glpiGroupName?: string }>;
}): Promise<Contract> {
  return request("/contracts", { method: "POST", body: JSON.stringify(payload) });
}

export type ContractFeatureStatus = "NOT_STARTED" | "IN_PROGRESS" | "DELIVERED" | "VALIDATED";

export async function createContractModule(
  contractId: string,
  payload: { name: string; weight?: number; criticality?: ContractItemCriticality; validatorId?: string | null }
): Promise<Contract> {
  return request(`/contracts/${contractId}/modules`, { method: "POST", body: JSON.stringify(payload) });
}

export async function updateContractModule(
  contractId: string,
  moduleId: string,
  payload: { name?: string; weight?: number; criticality?: ContractItemCriticality; validatorId?: string | null }
): Promise<Contract> {
  return request(`/contracts/${contractId}/modules/${moduleId}`, { method: "PUT", body: JSON.stringify(payload) });
}

export async function deleteContractModule(contractId: string, moduleId: string): Promise<Contract> {
  return request(`/contracts/${contractId}/modules/${moduleId}`, { method: "DELETE" });
}

export async function createContractFeature(
  contractId: string,
  moduleId: string,
  payload: {
    itemCode?: string | null;
    name: string;
    weight?: number;
    criticality?: ContractItemCriticality;
    status?: ContractFeatureStatus;
    deliveryStatus?: ContractItemDeliveryStatus;
  }
): Promise<Contract> {
  return request(`/contracts/${contractId}/modules/${moduleId}/features`, { method: "POST", body: JSON.stringify(payload) });
}

export async function updateContractFeature(
  contractId: string,
  moduleId: string,
  featureId: string,
  payload: {
    itemCode?: string | null;
    name?: string;
    weight?: number;
    criticality?: ContractItemCriticality;
    status?: ContractFeatureStatus;
    deliveryStatus?: ContractItemDeliveryStatus;
  }
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

export async function getFiscalUserOptions(): Promise<FiscalUserOption[]> {
  return request("/fiscais/user-options");
}

export async function createFiscal(payload: { name: string; email: string; phone: string; userId?: string | null }): Promise<Fiscal> {
  return request("/fiscais", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateFiscal(id: string, payload: { name: string; email: string; phone: string; userId?: string | null }): Promise<Fiscal> {
  return request(`/fiscais/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export type UserProfileColor =
  | "#2563eb"
  | "#7c3aed"
  | "#db2777"
  | "#dc2626"
  | "#ea580c"
  | "#ca8a04"
  | "#16a34a"
  | "#0891b2"
  | "#475569"
  | "#111827";

export const USER_PROFILE_COLORS: UserProfileColor[] = [
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#dc2626",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#0891b2",
  "#475569",
  "#111827"
];

export type AuthMe = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  profileColor?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  phone?: string | null;
  role: string;
  mustChangePassword?: boolean;
};

export async function getAuthMe(): Promise<AuthMe> {
  return request("/auth/me");
}

export async function updateMyProfile(payload: {
  firstName?: string | null;
  lastName?: string | null;
  profileColor?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  phone?: string | null;
}): Promise<AuthMe> {
  return request("/profile", { method: "PATCH", body: JSON.stringify(payload) });
}

export type UserAccessEventInput = {
  eventType: "PAGE_VIEW" | "HEARTBEAT";
  path?: string | null;
  pathLabel?: string | null;
  sessionId?: string | null;
  durationSeconds?: number | null;
  metadata?: unknown;
};

export async function trackUserAccessEvent(payload: UserAccessEventInput): Promise<void> {
  await request("/usage/track", { method: "POST", body: JSON.stringify(payload), keepalive: true });
}

export type UserUsageReport = {
  period: { preset: string; from: string; to: string };
  users: Array<{
    userId?: string | null;
    userEmail: string;
    role?: string | null;
    approvalStatus?: string | null;
    loginCount: number;
    pageViewCount: number;
    totalActiveSeconds: number;
    firstSeenAt?: string | null;
    lastSeenAt?: string | null;
    topPaths: Array<{ path: string; pathLabel: string; count: number; activeSeconds: number }>;
    recentEvents: Array<{
      eventType: string;
      path?: string | null;
      pathLabel?: string | null;
      occurredAt: string;
      durationSeconds: number;
    }>;
  }>;
};

export async function getUserUsageReport(params: { preset?: string; from?: string; to?: string } = {}): Promise<UserUsageReport> {
  const sp = new URLSearchParams();
  if (params.preset) sp.set("preset", params.preset);
  if (params.from) sp.set("from", params.from);
  if (params.to) sp.set("to", params.to);
  const qs = sp.toString();
  return request(`/usage/report${qs ? `?${qs}` : ""}`);
}

export type MyAssignments = {
  user: { id: string; email: string; fiscalProfile?: { id: string; name: string; email: string } | null };
  totals: {
    contracts: number;
    modules: number;
    projects: number;
    tasks: number;
    governanceTickets: number;
    glpiTickets: number;
  };
  contracts: Array<{ id: string; number: string; name: string; status: string; endDate: string; role: string }>;
  modules: Array<{
    id: string;
    name: string;
    criticality: string;
    weight: string;
    status: string;
    delivered: number;
    partial: number;
    total: number;
    contract: { id: string; number: string; name: string; status: string };
  }>;
  projects: Array<{
    id: string;
    name: string;
    startDate?: string | null;
    plannedEndDate?: string | null;
    updatedAt: string;
    status: string;
    total: number;
    done: number;
    overdue: number;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    dueDate?: string | null;
    internalResponsible?: string | null;
    assigneeExternal?: string | null;
    project: { id: string; name: string };
    group: { id: string; name: string };
  }>;
  governanceTickets: Array<{
    id: string;
    ticketId: string;
    status: string;
    priority?: string | null;
    slaDeadline?: string | null;
    role: string;
    contract: { id: string; number: string; name: string };
  }>;
  glpiTickets: Array<{
    glpiTicketId: number;
    title?: string | null;
    status?: string | null;
    priority?: string | null;
    dateCreation?: string | null;
    dateModification?: string | null;
    assignedUserName?: string | null;
    requesterEmail?: string | null;
    contractGroupName?: string | null;
    open: boolean;
  }>;
};

export async function getMyAssignments(): Promise<MyAssignments> {
  return request("/assignments/me");
}

export type UserRecord = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  profileColor?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  phone?: string | null;
  role: string;
  approvalStatus?: "PENDING" | "APPROVED" | "REJECTED";
  mustChangePassword?: boolean;
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
  payload: { role?: "ADMIN" | "EDITOR" | "VIEWER"; password?: string; approvalStatus?: "PENDING" | "APPROVED" | "REJECTED" }
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

/** Modelo .xlsx para preencher módulos e funcionalidades antes de importar no contrato. */
export async function fetchContractStructureTemplateBlob(contractId: string): Promise<Blob> {
  const apiBase = await resolveRequestApiBase();
  const auth = await authHeadersForApi();
  const res = await fetch(`${apiBase}/contracts/${contractId}/structure-template.xlsx`, {
    headers: { ...auth },
    cache: "no-store"
  });
  if (!res.ok) {
    let detail = "";
    try {
      const payload = (await res.json()) as { message?: string | string[]; error?: string };
      const m = payload.message;
      detail = (Array.isArray(m) ? m.join("; ") : m) || payload.error || "";
    } catch {
      detail = "";
    }
    throw new Error(detail || `Falha ao baixar modelo (${res.status})`);
  }
  return res.blob();
}

/** Importa módulos e funcionalidades a partir de arquivo .xlsx (campo file + opcional replace). */
export async function importContractStructureFromXlsx(
  contractId: string,
  file: File,
  replace: boolean
): Promise<Contract> {
  const apiBase = await resolveRequestApiBase();
  const auth = await authHeadersForApi();
  const form = new FormData();
  form.append("file", file);
  if (replace) form.append("replace", "true");
  const res = await fetch(`${apiBase}/contracts/${contractId}/structure-import`, {
    method: "POST",
    headers: { ...auth },
    body: form,
    cache: "no-store"
  });
  if (!res.ok) {
    let detail = "";
    try {
      const payload = (await res.json()) as { message?: string; error?: string };
      detail = (typeof payload.message === "string" ? payload.message : "") || payload.error || "";
    } catch {
      detail = "";
    }
    throw new Error(detail || `Falha na importação (${res.status})`);
  }
  return (await res.json()) as Contract;
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
  projectId?: string | null;
}): Promise<Goal> {
  return request("/goals", { method: "POST", body: JSON.stringify(payload) });
}

export async function getGoal(id: string): Promise<Goal> {
  return request(`/goals/${id}`);
}

export async function updateGoal(
  id: string,
  payload: {
    title?: string;
    description?: string | null;
    year?: number;
    status?: "PLANNED" | "IN_PROGRESS" | "COMPLETED";
    priority?: string | null;
    responsibleId?: string;
    projectId?: string | null;
  }
): Promise<Goal> {
  return request(`/goals/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}

export async function createGoalAction(
  id: string,
  payload: { title: string; description?: string; status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED"; progress: number; dueDate?: string; responsibleId: string }
): Promise<Record<string, unknown>> {
  return request(`/goals/${id}/actions`, { method: "POST", body: JSON.stringify(payload) });
}

export async function setManualGoalProgress(id: string, progress: number): Promise<Record<string, unknown>> {
  return request(`/goals/${id}/manual-progress`, { method: "POST", body: JSON.stringify({ progress }) });
}

// --- Projetos (importação Monday.com / Excel) ---

export type ProjectSupervisor = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  profileColor?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  phone?: string | null;
  role: string;
};

export type ProjectListItem = {
  id: string;
  name: string;
  context?: string | null;
  supervisorId?: string | null;
  supervisor?: ProjectSupervisor | null;
  startDate?: string | null;
  plannedEndDate?: string | null;
  projectCollectionId?: string | null;
  projectCollection?: { id: string; name: string } | null;
  goals?: Array<{ id: string; title: string; status: string; year: number }>;
  createdAt: string;
  updatedAt: string;
  _count?: { groups: number; tasks: number };
  _stats?: {
    total: number;
    done: number;
    progress: number;
    blocked: number;
    notStarted: number;
    other: number;
    empty: number;
    overdueNotDone: number;
    completionPercent: number;
  };
};

export type ProjectCollection = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  projects?: ProjectListItem[];
  _count?: { projects: number };
};

/** Linha na vista plana multi-projeto. */
export type ProjectFlatTaskRow = {
  id: string;
  projectId: string;
  projectName: string;
  groupId: string;
  groupName: string;
  parentTaskId: string | null;
  title: string;
  status: string;
  statusKind: "done" | "progress" | "blocked" | "notStarted" | "other" | "empty";
  assigneeExternal: string | null;
  internalResponsible: string | null;
  dueDate: string | null;
  goalId: string | null;
  goalTitle: string | null;
  glpiTicketId: number | null;
  sortOrder: number;
};

export type ProjectsTasksFlatResponse = {
  items: ProjectFlatTaskRow[];
  total: number;
  limit: number;
  offset: number;
  truncated: boolean;
};

export type ProjectsTasksFlatParams = {
  filter?: string;
  statusKind?: string;
  projectId?: string;
  groupId?: string;
  assignee?: string;
  q?: string;
  onlyRoot?: boolean;
  sort?: string;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
};

export type BulkPatchProjectTasksResult = {
  updated: number;
  failed: { taskId: string; message: string }[];
};

/** Métricas agregadas de todos os projetos (lista / mini dashboard). */
export type ProjectsDashboardStats = {
  projectCount: number;
  groupCount: number;
  taskCount: number;
  rootTaskCount: number;
  subTaskCount: number;
  statusBreakdown: {
    done: number;
    progress: number;
    blocked: number;
    notStarted: number;
    other: number;
    empty: number;
  };
  overdueNotDoneCount: number;
  projectsWithOverdueCount: number;
  tasksWithoutDueDateNotDone: number;
};

export type ProjectTaskFile = {
  id: string;
  fileName: string;
  mimeType: string;
  createdAt: string;
};

export type ProjectTaskComment = {
  id: string;
  body: string;
  authorId?: string | null;
  authorEmail?: string | null;
  createdAt: string;
};

export type ProjectTaskResponsibleUser = {
  userId: string;
  user: ProjectSupervisor;
};

export type ProjectTaskTree = {
  id: string;
  projectId: string;
  groupId: string;
  parentTaskId: string | null;
  title: string;
  status: string;
  assigneeExternal: string | null;
  assigneeUserId?: string | null;
  assigneeUser?: ProjectSupervisor | null;
  dueDate: string | null;
  description: string | null;
  effort: string | null;
  internalResponsible: string | null;
  goalId?: string | null;
  goal?: { id: string; title: string; status: string; year: number } | null;
  glpiTicketId?: number | null;
  glpiTicket?: { glpiTicketId: number; title?: string | null; status?: string | null } | null;
  responsibleUsers?: ProjectTaskResponsibleUser[];
  sortOrder: number;
  /** Anexos da tarefa (quando o backend devolve na árvore). */
  attachments?: ProjectTaskFile[];
  /** Comentários da tarefa (histórico colaborativo). */
  comments?: ProjectTaskComment[];
  children: ProjectTaskTree[];
};

export type ProjectTaskPatchPayload = {
  title?: string;
  status?: string;
  assigneeExternal?: string;
  assigneeUserId?: string | null;
  description?: string;
  internalResponsible?: string;
  goalId?: string | null;
  glpiTicketId?: number | null;
  responsibleUserIds?: string[];
  /** ISO 8601 ou string vazia para limpar. */
  dueDate?: string;
  effort?: number;
};

export type ProjectTaskPatchResponse = Omit<ProjectTaskTree, "children" | "attachments"> & {
  attachments: ProjectTaskFile[];
  comments: ProjectTaskComment[];
};

export type ProjectGroupWithTasks = {
  id: string;
  projectId: string;
  name: string;
  sortOrder: number;
  tasks: ProjectTaskTree[];
};

export type ProjectDetail = {
  id: string;
  name: string;
  context?: string | null;
  supervisorId?: string | null;
  supervisor?: ProjectSupervisor | null;
  startDate?: string | null;
  plannedEndDate?: string | null;
  projectCollectionId?: string | null;
  createdAt: string;
  updatedAt: string;
  projectCollection?: ({ id: string; name: string; projects?: ProjectListItem[] }) | null;
  goals?: Array<{ id: string; title: string; status: string; year: number }>;
  groups: ProjectGroupWithTasks[];
};

export async function getProjects(): Promise<ProjectListItem[]> {
  return request("/projects");
}

export async function getProjectCollections(): Promise<ProjectCollection[]> {
  return request("/projects/groups");
}

export async function getProjectSupervisors(): Promise<ProjectSupervisor[]> {
  return request("/projects/supervisors");
}

export async function createProjectCollection(payload: { name: string }): Promise<ProjectCollection> {
  return request("/projects/groups", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateProjectCollection(id: string, payload: { name: string }): Promise<ProjectCollection> {
  return request(`/projects/groups/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function deleteProjectCollection(id: string): Promise<{ ok: true; id: string }> {
  return request(`/projects/groups/${id}`, { method: "DELETE" });
}

export async function createProject(payload: {
  name: string;
  context?: string | null;
  supervisorId?: string | null;
  startDate?: string | null;
  plannedEndDate?: string | null;
  projectCollectionId?: string | null;
}): Promise<ProjectListItem> {
  return request("/projects", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateProject(
  id: string,
  payload: {
    name: string;
    context?: string | null;
    supervisorId?: string | null;
    startDate?: string | null;
    plannedEndDate?: string | null;
    projectCollectionId?: string | null;
  }
): Promise<ProjectListItem> {
  return request(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function getProjectsDashboard(): Promise<ProjectsDashboardStats> {
  return request("/projects/dashboard");
}

function appendProjectsTasksParams(sp: URLSearchParams, p: ProjectsTasksFlatParams): void {
  if (p.filter) sp.set("filter", p.filter);
  if (p.statusKind) sp.set("statusKind", p.statusKind);
  if (p.projectId) sp.set("projectId", p.projectId);
  if (p.groupId) sp.set("groupId", p.groupId);
  if (p.assignee) sp.set("assignee", p.assignee);
  if (p.q) sp.set("q", p.q);
  if (p.onlyRoot) sp.set("onlyRoot", "true");
  if (p.sort) sp.set("sort", p.sort);
  if (p.order) sp.set("order", p.order);
  if (p.limit != null) sp.set("limit", String(p.limit));
  if (p.offset != null) sp.set("offset", String(p.offset));
}

export async function getProjectsTasksFlat(params: ProjectsTasksFlatParams): Promise<ProjectsTasksFlatResponse> {
  const sp = new URLSearchParams();
  appendProjectsTasksParams(sp, params);
  const qs = sp.toString();
  return request(qs ? `/projects/tasks?${qs}` : "/projects/tasks");
}

export async function bulkPatchProjectTasks(payload: {
  items: { projectId: string; taskId: string; status: string }[];
}): Promise<BulkPatchProjectTasksResult> {
  return request("/projects/tasks/bulk", {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function getProject(id: string): Promise<ProjectDetail> {
  return request(`/projects/${id}`);
}

export async function importProjectMonday(payload: MondayImportPayload): Promise<ProjectDetail> {
  return request("/projects/monday-import", { method: "POST", body: JSON.stringify(payload) });
}

export async function deleteProject(id: string): Promise<{ ok: true; id: string }> {
  return request(`/projects/${id}`, { method: "DELETE" });
}

export async function patchProjectTask(
  projectId: string,
  taskId: string,
  payload: ProjectTaskPatchPayload
): Promise<ProjectTaskPatchResponse> {
  return request(`/projects/${projectId}/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function deleteProjectTask(projectId: string, taskId: string): Promise<{ ok: true; id: string }> {
  return request(`/projects/${projectId}/tasks/${taskId}`, { method: "DELETE" });
}

export async function createProjectTask(
  projectId: string,
  payload: {
    title: string;
    groupId?: string;
    groupName?: string;
    parentTaskId?: string;
    status?: string;
    dueDate?: string;
    description?: string;
    assigneeExternal?: string;
    assigneeUserId?: string | null;
    internalResponsible?: string;
    goalId?: string | null;
    glpiTicketId?: number | null;
    responsibleUserIds?: string[];
    effort?: number;
  }
): Promise<ProjectTaskPatchResponse> {
  return request(`/projects/${projectId}/tasks`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function uploadProjectTaskAttachment(projectId: string, taskId: string, file: File): Promise<ProjectTaskFile> {
  const form = new FormData();
  form.append("file", file);
  const t = readBrowserAuthToken();
  const headers: HeadersInit = t ? { Authorization: `Bearer ${t}` } : {};
  const apiBase = await resolveRequestApiBase();
  const response = await fetch(`${apiBase}/projects/${projectId}/tasks/${taskId}/attachments`, {
    method: "POST",
    headers,
    body: form,
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(await parseUploadError(response));
  }
  return (await response.json()) as ProjectTaskFile;
}

export async function createProjectTaskComment(projectId: string, taskId: string, body: string): Promise<ProjectTaskComment> {
  return request(`/projects/${projectId}/tasks/${taskId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body })
  });
}
