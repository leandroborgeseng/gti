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
  return parts.filter(Boolean).join(" · ");
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

export type ContractAmendmentType =
  | "TERMO_ADITIVO"
  | "REAJUSTE"
  | "REPACTUACAO"
  | "REVISAO"
  | "RENOVACAO"
  | "PRORROGACAO"
  | "ACRESCIMO"
  | "SUPRESSAO"
  | "APOSTILAMENTO"
  | "OUTRO";

export type ContractAmendmentStatus = "ACTIVE" | "CANCELLED";
export type ContractAmendmentItemAction = "CREATE" | "UPDATE" | "SUPPRESS";

export type ContractAmendmentItemSnapshot = {
  id?: string | null;
  sequence?: number | null;
  typeId?: string;
  description?: string;
  unitId?: string;
  quantity?: number;
  unitValue?: number;
  totalValue?: number;
  totalManual?: boolean;
  totalJustification?: string | null;
  billingKind?: ContractPricingBillingKind;
  periodicity?: ContractPricingPeriodicity | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  status?: ContractPricingItemStatus;
  includeInGlosaBase?: boolean;
};

export type ContractAmendmentItem = {
  id: string;
  amendmentId: string;
  pricingItemId?: string | null;
  resultPricingItemId?: string | null;
  action: ContractAmendmentItemAction;
  adjustmentPercent?: string | null;
  beforeSnapshot?: ContractAmendmentItemSnapshot | null;
  afterSnapshot?: ContractAmendmentItemSnapshot | null;
  createdAt: string;
};

export type ContractAmendment = {
  id: string;
  contractId: string;
  type?: ContractAmendmentType;
  status?: ContractAmendmentStatus;
  referenceCode?: string | null;
  formalizationDate?: string | null;
  /** Início dos efeitos (também enviado como effectsStartDate na criação). */
  effectiveDate: string;
  description: string;
  previousTotalValue: string;
  previousMonthlyValue: string;
  previousEndDate: string;
  previousGlobalValue?: string | null;
  newTotalValue?: string | null;
  newMonthlyValue?: string | null;
  newEndDate?: string | null;
  newGlobalValue?: string | null;
  adjustmentPercent?: string | null;
  indexReference?: string | null;
  cancelJustification?: string | null;
  cancelledAt?: string | null;
  actorId?: string | null;
  actorLabel?: string | null;
  createdAt: string;
  items?: ContractAmendmentItem[];
};

export type CreateContractAmendmentPayload = {
  type: ContractAmendmentType;
  referenceCode?: string;
  formalizationDate?: string;
  effectsStartDate: string;
  description: string;
  newEndDate?: string;
  newTotalValue?: number;
  newMonthlyValue?: number;
  adjustmentPercent?: number;
  indexReference?: string;
  items?: Array<{
    action: ContractAmendmentItemAction;
    pricingItemId?: string;
    adjustmentPercent?: number;
    after?: {
      typeId?: string;
      description?: string;
      unitId?: string;
      quantity?: number;
      unitValue?: number;
      totalValue?: number;
      totalManual?: boolean;
      totalJustification?: string | null;
      billingKind?: ContractPricingBillingKind;
      periodicity?: ContractPricingPeriodicity | null;
      periodStart?: string | null;
      periodEnd?: string | null;
      includeInGlosaBase?: boolean;
    };
  }>;
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
export type ContractItemCriticality = "CRITICA" | "ALTA" | "MEDIA" | "BAIXA" | "APOIO" | "NAO_SE_APLICA";

/**
 * Proporção do valor mensal com base no progresso de entrega: «Entregue» = 1, «Parcialmente entregue» = 0,5,
 * «Não entregue» = 0; (soma dos pesos / itens considerados) × valor mensal. «Não se aplica» fica fora do cálculo.
 */
export type BillingPhase = "UNDEFINED" | "PRE_IMPLEMENTATION" | "IMPLEMENTATION" | "MONTHLY";

export type FeatureImplantationProportion = {
  applicable: boolean;
  totalFeatures: number;
  consideredInCalculation?: number;
  notApplicableCount?: number;
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

export type ContractLinkedUser = {
  id: string;
  name: string;
  email: string;
  organizationAcronym?: string | null;
  active: boolean;
  role?: string;
};

export type EffectiveResponsibleUser = ContractLinkedUser & {
  sources?: Array<"GROUP" | "FEATURE">;
};

export type ContractValidationGroup = {
  id: string;
  name: string;
  description?: string | null;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
  memberUserIds?: string[];
  members?: ContractLinkedUser[];
  featuresCount?: number;
};

export type ContractScheduleType =
  | "IMPLANTACAO"
  | "MIGRACAO"
  | "TREINAMENTO"
  | "ENTREGA_EQUIPAMENTOS"
  | "INSTALACAO"
  | "INTEGRACAO"
  | "DESENVOLVIMENTO"
  | "TRANSICAO"
  | "OPERACAO_ASSISTIDA"
  | "PLANO_ACAO"
  | "CORRECAO_PENDENCIAS"
  | "ENCERRAMENTO"
  | "OUTRO";

export type ContractScheduleOrigin =
  | "TERMO_REFERENCIA"
  | "PROPOSTA_EMPRESA"
  | "PLANEJAMENTO_INICIAL"
  | "REUNIAO"
  | "ADITIVO"
  | "NOTIFICACAO"
  | "PLANO_ACAO"
  | "DETERMINACAO_ADMIN"
  | "OUTRO";

export type ContractScheduleStatus =
  | "RASCUNHO"
  | "ENVIADO_ANALISE"
  | "AJUSTES_SOLICITADOS"
  | "APROVADO"
  | "EM_EXECUCAO"
  | "SUSPENSO"
  | "CONCLUIDO"
  | "CANCELADO"
  | "SUBSTITUIDO";

export type ContractScheduleMilestoneStatus =
  | "NAO_INICIADA"
  | "EM_ANDAMENTO"
  | "CONCLUIDA"
  | "ATRASADA"
  | "BLOQUEADA"
  | "CANCELADA";

export type ContractScheduleMilestone = {
  id: string;
  sequence: number;
  activity: string;
  description?: string | null;
  pricingItemId?: string | null;
  featureId?: string | null;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  actualStartDate?: string | null;
  actualEndDate?: string | null;
  percentComplete?: number | null;
  status: ContractScheduleMilestoneStatus;
  dependencies?: string | null;
  observations?: string | null;
  responsibleUserIds?: string[];
  responsibleUsers?: ContractLinkedUser[];
};

export type ContractSchedule = {
  id: string;
  contractId: string;
  name: string;
  type: ContractScheduleType;
  purpose?: string | null;
  origin: ContractScheduleOrigin;
  description?: string | null;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  companyResponsibles?: string | null;
  status: ContractScheduleStatus;
  version: number;
  lineageId: string;
  replacedById?: string | null;
  impactaFinanceiro: boolean;
  pricingItemId?: string | null;
  observations?: string | null;
  createdAt?: string;
  updatedAt?: string;
  responsibleUserIds?: string[];
  responsibleUsers?: ContractLinkedUser[];
  milestones?: ContractScheduleMilestone[];
  attachments?: AttachmentRecord[];
};

export type ContractScheduleMilestonePayload = {
  id?: string;
  sequence: number;
  activity: string;
  description?: string | null;
  pricingItemId?: string | null;
  featureId?: string | null;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  actualStartDate?: string | null;
  actualEndDate?: string | null;
  percentComplete?: number | null;
  status?: ContractScheduleMilestoneStatus;
  dependencies?: string | null;
  observations?: string | null;
  responsibleUserIds?: string[];
};

export type CreateContractSchedulePayload = {
  name: string;
  type: ContractScheduleType;
  purpose?: string | null;
  origin?: ContractScheduleOrigin;
  description?: string | null;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  responsibleUserIds?: string[];
  companyResponsibles?: string | null;
  status?: ContractScheduleStatus;
  impactaFinanceiro?: boolean;
  pricingItemId?: string | null;
  observations?: string | null;
  milestones?: ContractScheduleMilestonePayload[];
};

export type UpdateContractSchedulePayload = Partial<CreateContractSchedulePayload>;


export type ContractOccurrenceType =
  | "DESCUMPRIMENTO_SLA"
  | "ATRASO_ENTREGA"
  | "FALHA_QUALIDADE"
  | "INCIDENTE_OPERACIONAL"
  | "NAO_CONFORMIDADE"
  | "RECLAMACAO"
  | "AUDITORIA"
  | "OUTRO";

export type ContractOccurrenceOrigin =
  | "FISCALIZACAO"
  | "MEDICAO"
  | "CHAMADO_GLPI"
  | "EMPRESA"
  | "AUDITORIA_INTERNA"
  | "DENUNCIA"
  | "CONTROLADORIA"
  | "OUTRO";

export type ContractOccurrenceSeverity = "BAIXA" | "MEDIA" | "ALTA" | "CRITICA";

export type ContractOccurrenceStatus =
  | "EM_ANALISE"
  | "AGUARDANDO_PROVIDENCIA_INTERNA"
  | "AGUARDANDO_EMPRESA"
  | "EM_REGULARIZACAO"
  | "REGULARIZADA"
  | "NAO_REGULARIZADA"
  | "REINCIDENTE"
  | "ENCAMINHADA_CONTROLADORIA"
  | "EM_PROCESSO_ADMINISTRATIVO"
  | "CONCLUIDA"
  | "ARQUIVADA";

export type ContractControladoriaCaseStatus =
  | "EM_PREPARACAO"
  | "ENCAMINHADO"
  | "RECEBIDO_CONTROLADORIA"
  | "COMPLEMENTACAO_SOLICITADA"
  | "EM_INSTRUCAO"
  | "AGUARDANDO_DEFESA"
  | "EM_ANALISE"
  | "AGUARDANDO_DECISAO"
  | "EM_RECURSO"
  | "CONCLUIDO"
  | "ARQUIVADO";

export type ContractOccurrenceEvent = {
  id: string;
  eventType: string;
  fromStatus?: ContractOccurrenceStatus | null;
  toStatus?: ContractOccurrenceStatus | null;
  justification?: string | null;
  actorId?: string | null;
  actorLabel?: string | null;
  payload?: unknown;
  createdAt?: string;
};

export type ContractControladoriaCase = {
  id: string;
  contractId: string;
  occurrenceId: string;
  status: ContractControladoriaCaseStatus;
  justification: string;
  summary: string;
  suggestedActions?: string | null;
  snapshotJson?: unknown;
  processNumber?: string | null;
  originSystem?: string | null;
  processLink?: string | null;
  openedAt?: string | null;
  subject?: string | null;
  unit?: string | null;
  responsiblesText?: string | null;
  phase?: string | null;
  deadlinesText?: string | null;
  decisionsText?: string | null;
  penaltiesText?: string | null;
  resultText?: string | null;
  seiNumber?: string | null;
  seiLink?: string | null;
  createdAt?: string;
  updatedAt?: string;
  occurrence?: {
    id: string;
    title: string;
    status: ContractOccurrenceStatus;
    type: ContractOccurrenceType;
  };
  contract?: {
    id: string;
    number: string;
    name: string;
    internalCode?: string | null;
    companyName?: string;
  };
};

export type ContractOccurrence = {
  id: string;
  contractId: string;
  type: ContractOccurrenceType;
  origin: ContractOccurrenceOrigin;
  title: string;
  description?: string | null;
  detectionDate: string;
  linkedPricingItemIds?: string[];
  linkedFeatureIds?: string[];
  linkedMeasurementIds?: string[];
  linkedGlosaIds?: string[];
  linkedScheduleIds?: string[];
  severity: ContractOccurrenceSeverity;
  internalResponsibleUserId?: string | null;
  internalResponsible?: ContractLinkedUser | null;
  regularizationDeadline?: string | null;
  status: ContractOccurrenceStatus;
  conclusion?: string | null;
  evidenceNotes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  events?: ContractOccurrenceEvent[];
  controladoriaCases?: ContractControladoriaCase[];
};

export type CreateContractOccurrencePayload = {
  type: ContractOccurrenceType;
  origin: ContractOccurrenceOrigin;
  title: string;
  description?: string | null;
  detectionDate: string;
  linkedPricingItemIds?: string[];
  linkedFeatureIds?: string[];
  linkedMeasurementIds?: string[];
  linkedGlosaIds?: string[];
  linkedScheduleIds?: string[];
  severity?: ContractOccurrenceSeverity;
  internalResponsibleUserId?: string | null;
  regularizationDeadline?: string | null;
  status?: ContractOccurrenceStatus;
  conclusion?: string | null;
  evidenceNotes?: string | null;
};

export type UpdateContractOccurrencePayload = Partial<Omit<CreateContractOccurrencePayload, "status">>;

export type ChangeContractOccurrenceStatusPayload = {
  status: ContractOccurrenceStatus;
  justification: string;
};

export type ForwardOccurrenceToControladoriaPayload = {
  justification: string;
  summary: string;
  suggestedActions?: string | null;
};

export type UpdateContractControladoriaCasePayload = {
  status?: ContractControladoriaCaseStatus;
  processNumber?: string | null;
  originSystem?: string | null;
  processLink?: string | null;
  openedAt?: string | null;
  subject?: string | null;
  unit?: string | null;
  responsiblesText?: string | null;
  phase?: string | null;
  deadlinesText?: string | null;
  decisionsText?: string | null;
  penaltiesText?: string | null;
  resultText?: string | null;
  seiNumber?: string | null;
  seiLink?: string | null;
};


export type FeatureAssignmentReason = "GROUP" | "FEATURE" | "MODULE" | "UNDEFINED_GROUP" | "NONE";
export type ModulesDeliveryAssignmentFilter =
  | ""
  | "ALL"
  | "ASSIGNED_TO_ME"
  | "GROUP_MEMBER"
  | "MODULE_FISCAL"
  | "NO_RESPONSIBLE";

export type Contract = {
  id: string;
  number: string;
  /** Número formal sem ano (somente dígitos). */
  formalNumber?: string | null;
  contractYear?: number | null;
  /** Código interno SIGTI (ex.: ST-2026-001), gerado na criação. */
  internalCode?: string | null;
  administrativeProcess?: string | null;
  organizationId?: string | null;
  contractTypeCatalogId?: string | null;
  hiringTypeId?: string | null;
  hiringProcedureNumber?: string | null;
  globalValueOriginal?: string | null;
  globalValueCurrent?: string | null;
  globalValueManual?: boolean;
  globalValueJustification?: string | null;
  organization?: { id: string; name: string; acronym: string; active?: boolean } | null;
  contractTypeCatalog?: { id: string; name: string; acronym: string; legacyEnum?: string | null } | null;
  hiringType?: { id: string; name: string } | null;
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
  supplierId?: string | null;
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
    validator?: { id: string; email: string; role: string; name?: string } | null;
    /** Fiscais responsáveis (N:N). Preferir este campo em relação a `validatorId`. */
    fiscalUsers?: ContractLinkedUser[];
    fiscalUserIds?: string[];
    glosaPricingItemId?: string | null;
    glosaPricingItem?: Pick<ContractPricingItem, "id" | "description" | "sequence"> | null;
    weight: string;
    features: Array<{
      id: string;
      itemCode?: string | null;
      name: string;
      criticality?: ContractItemCriticality;
      status: string;
      weight: string;
      deliveryStatus?: ContractItemDeliveryStatus;
      validationGroupId?: string | null;
      validationGroup?: { id: string; name: string; active: boolean } | null;
      groupUndefined?: boolean;
      groupMemberUsers?: ContractLinkedUser[];
      /** Responsáveis específicos do item (complementam o grupo). */
      responsibleUsers?: ContractLinkedUser[];
      responsibleUserIds?: string[];
      responsibilitySource?: "GROUP" | "FEATURE" | "GROUP_AND_FEATURE" | "UNDEFINED_GROUP" | "MODULE";
      effectiveResponsibles?: EffectiveResponsibleUser[];
      assignmentReasons?: FeatureAssignmentReason[];
    }>;
  }>;
  /** Grupos de validação do contrato. */
  validationGroups?: ContractValidationGroup[];
  /** Cronogramas e marcos operacionais do contrato. */
  schedules?: ContractSchedule[];
  occurrences?: ContractOccurrence[];
  controladoriaCases?: ContractControladoriaCase[];
  services?: Array<{ id: string; name: string; unit: string; unitValue: string }>;
  amendments?: ContractAmendment[];
  /** Presente na listagem (`GET /contracts`) para indicar quantos aditivos existem. */
  _count?: { amendments: number };
  /** Indicador: valor mensal × (funcionalidades entregues / total em módulos). */
  featureImplantationProportion?: FeatureImplantationProportion;
  /** Histórico auditável de inserção, exclusão e mudança de status dos itens contratuais. */
  itemChangeLogs?: ContractItemChangeLog[];
  /** Itens de precificação dinâmica (mensalidade, horas, UST, etc.). */
  pricingItems?: ContractPricingItem[];
  /** Totais consolidados dos itens ativos. */
  pricingTotals?: ContractPricingTotals;
  /** Quando true, exclusão definitiva de itens é bloqueada (há medições ou aditivos). */
  pricingLocked?: boolean;
};

export type ContractPricingBillingKind = "RECURRING" | "ONE_TIME" | "ON_DEMAND";
export type ContractPricingPeriodicity =
  | "MONTHLY"
  | "BIMONTHLY"
  | "QUARTERLY"
  | "SEMIANNUAL"
  | "ANNUAL"
  | "CUSTOM";
export type ContractPricingItemStatus = "ACTIVE" | "CANCELLED";

export type ContractItemTypeCatalog = {
  id: string;
  code: string;
  label: string;
  active: boolean;
  sortOrder: number;
};

export type MeasureUnitCatalog = {
  id: string;
  code: string;
  label: string;
  active: boolean;
  sortOrder: number;
};

export type ContractPricingCatalog = {
  types: ContractItemTypeCatalog[];
  units: MeasureUnitCatalog[];
};

export type ContractPricingItem = {
  id: string;
  contractId: string;
  sequence: number;
  typeId: string;
  description: string;
  unitId: string;
  quantity: string;
  unitValue: string;
  totalValue: string;
  totalManual: boolean;
  totalJustification?: string | null;
  billingKind: ContractPricingBillingKind;
  periodicity?: ContractPricingPeriodicity | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  status: ContractPricingItemStatus;
  includeInGlosaBase: boolean;
  consumedQuantity?: string;
  consumptionEnabled?: boolean;
  consumptionUnitId?: string | null;
  consumptionAvailableQuantity?: string | null;
  consumptionFinancialRule?: ConsumptionFinancialRule | null;
  consumptionAvailability?: ConsumptionAvailabilityPeriod | null;
  consumptionAccumulates?: boolean;
  consumptionRequiresValidation?: boolean;
  type?: ContractItemTypeCatalog & { participatesInGlosa?: boolean };
  unit?: MeasureUnitCatalog;
};

export type ConsumptionFinancialRule =
  | "INCLUDED_IN_MONTHLY"
  | "BILLED_BY_CONSUMPTION"
  | "CONTRACTED_BY_QUANTITY"
  | "BALANCE_ONLY";

export type ConsumptionAvailabilityPeriod =
  | "MONTHLY"
  | "ANNUAL"
  | "CONTRACT_TERM"
  | "SPECIFIC_PERIOD"
  | "AMENDMENT";

export type ContractPricingTotals = {
  recurringPredicted: number;
  oneTime: number;
  onDemand: number;
  globalEstimated: number;
  monthlyValue: number;
  installationValue: number | null;
};

export type ContractPricingItemInput = {
  id?: string;
  sequence?: number;
  typeId: string;
  description: string;
  unitId: string;
  quantity: number;
  unitValue: number;
  totalValue?: number;
  totalManual?: boolean;
  totalJustification?: string | null;
  billingKind: ContractPricingBillingKind;
  periodicity?: ContractPricingPeriodicity | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  status?: ContractPricingItemStatus;
  includeInGlosaBase?: boolean;
  consumptionEnabled?: boolean;
  consumptionUnitId?: string | null;
  consumptionAvailableQuantity?: number | null;
  consumptionFinancialRule?: ConsumptionFinancialRule | null;
  consumptionAvailability?: ConsumptionAvailabilityPeriod | null;
  consumptionAccumulates?: boolean;
  consumptionRequiresValidation?: boolean;
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

/** Chamado GLPI em cache vinculado a um grupo do contrato (somente leitura). */
export type ContractGlpiTicketCategory =
  | "CORRETIVO"
  | "EVOLUTIVO"
  | "SUPORTE"
  | "DESENVOLVIMENTO"
  | "DUVIDA"
  | "INDISPONIBILIDADE"
  | "OUTRO";

export type ContractGlpiTicketRow = {
  glpiTicketId: number;
  title: string | null;
  status: string | null;
  priority: string | null;
  dateCreation: string | null;
  dateModification: string | null;
  contractGroupId: number | null;
  contractGroupName: string | null;
  requesterName: string | null;
  assignedUserName: string | null;
  waitingParty: string | null;
  slaDeadline: string | null;
  slaOverdue: boolean | null;
  updatedAt: string;
  localClassification?: {
    category: ContractGlpiTicketCategory;
    notes: string | null;
  } | null;
};

export type ContractGlpiTicketsResponse = {
  contractId: string;
  glpiGroupIds: number[];
  glpiGroups: Array<{ glpiGroupId: number; glpiGroupName: string | null }>;
  tickets: ContractGlpiTicketRow[];
  total: number;
  facets: {
    statuses: string[];
    priorities: string[];
    slaOverdueAvailable: boolean;
  };
};

export type ContractGlpiTicketsQuery = {
  status?: string;
  priority?: string;
  from?: string;
  to?: string;
  slaOverdue?: boolean;
  take?: number;
};

export async function getContractGlpiTickets(
  contractId: string,
  params: ContractGlpiTicketsQuery = {}
): Promise<ContractGlpiTicketsResponse> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.priority) query.set("priority", params.priority);
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  if (params.slaOverdue) query.set("slaOverdue", "1");
  if (params.take != null) query.set("take", String(params.take));
  const suffix = query.toString();
  return request(`/contracts/${contractId}/glpi-tickets${suffix ? `?${suffix}` : ""}`);
}

export async function upsertContractGlpiTicketClassification(
  contractId: string,
  glpiTicketId: number,
  payload: { category: ContractGlpiTicketCategory; notes?: string | null }
): Promise<{
  contractId: string;
  glpiTicketId: number;
  category: ContractGlpiTicketCategory;
  notes: string | null;
}> {
  return request(`/contracts/${contractId}/glpi-tickets/${glpiTicketId}/classification`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

/** Totais agregados de entrega (sem listar funcionalidades). */
export type ModulesDeliveryTotals = {
  totalFeatures: number;
  consideredInCalculation?: number;
  notApplicableCount?: number;
  deliveredCount: number;
  partialCount: number;
  notDeliveredCount: number;
};

/** Resumo do contrato na página Funcionalidades (lazy-load). */
export type ContractModulesDeliveryOverview = {
  id: string;
  number: string;
  name: string;
  contractType: string;
  status: string;
  monthlyValue?: string;
  fiscal?: Pick<Fiscal, "id" | "name" | "email"> | null;
  manager?: Pick<Fiscal, "id" | "name" | "email"> | null;
  modulesCount?: number;
  totals: ModulesDeliveryTotals;
  featureImplantationProportion?: FeatureImplantationProportion;
  /** Presente apenas em resultados de pesquisa com filtros. */
  modules?: ContractModulesDeliveryModule[];
};

export type ContractModulesDeliveryModule = {
  id: string;
  name: string;
  criticality: ContractItemCriticality;
  validatorId?: string | null;
  validator?: { id: string; email: string; role: string; name?: string } | null;
  fiscalUsers?: ContractLinkedUser[];
  fiscalUserIds?: string[];
  glosaPricingItemId?: string | null;
  glosaPricingItem?: Pick<ContractPricingItem, "id" | "description" | "sequence"> | null;
  weight: unknown;
  totals: ModulesDeliveryTotals;
  featuresPage?: ModulesDeliveryFeaturesPage;
};

export type ModulesDeliveryFeature = {
  id: string;
  itemCode?: string | null;
  name: string;
  weight: unknown;
  status: string;
  criticality: ContractItemCriticality;
  deliveryStatus: ContractItemDeliveryStatus;
  validationGroupId?: string | null;
  validationGroup?: { id: string; name: string; active: boolean } | null;
  groupUndefined?: boolean;
  groupMemberUsers?: ContractLinkedUser[];
  responsibleUsers?: ContractLinkedUser[];
  responsibleUserIds?: string[];
  effectiveResponsibles?: EffectiveResponsibleUser[];
  assignmentReasons?: FeatureAssignmentReason[];
  isModuleFiscalForActor?: boolean;
};

export type ModulesDeliveryFeaturesPage = {
  contractId?: string;
  moduleId?: string;
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  features: ModulesDeliveryFeature[];
};

export async function getModulesDeliveryOverview(params?: {
  assignment?: string;
}): Promise<ContractModulesDeliveryOverview[]> {
  const sp = new URLSearchParams();
  if (params?.assignment) sp.set("assignment", params.assignment);
  const qs = sp.toString();
  return request(`/contracts/overview/modules-delivery${qs ? `?${qs}` : ""}`);
}

export async function getContractModulesDelivery(
  contractId: string
): Promise<{ contractId: string; modules: ContractModulesDeliveryModule[] }> {
  return request(`/contracts/${contractId}/modules-delivery`);
}

export async function getModuleFeaturesDelivery(
  contractId: string,
  moduleId: string,
  params?: {
    page?: number;
    pageSize?: number;
    q?: string;
    deliveryStatus?: string;
    criticality?: string;
    assignment?: string;
  }
): Promise<ModulesDeliveryFeaturesPage> {
  const sp = new URLSearchParams();
  if (params?.page != null) sp.set("page", String(params.page));
  if (params?.pageSize != null) sp.set("pageSize", String(params.pageSize));
  if (params?.q) sp.set("q", params.q);
  if (params?.deliveryStatus) sp.set("deliveryStatus", params.deliveryStatus);
  if (params?.criticality) sp.set("criticality", params.criticality);
  if (params?.assignment) sp.set("assignment", params.assignment);
  const qs = sp.toString();
  return request(`/contracts/${contractId}/modules/${moduleId}/features-delivery${qs ? `?${qs}` : ""}`);
}

export async function searchModulesDeliveryFeatures(params: {
  q?: string;
  deliveryStatus?: string;
  criticality?: string;
  assignment?: string;
  pageSize?: number;
}): Promise<{
  contracts: ContractModulesDeliveryOverview[];
  totalFeatures: number;
  truncated?: boolean;
}> {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.deliveryStatus) sp.set("deliveryStatus", params.deliveryStatus);
  if (params.criticality) sp.set("criticality", params.criticality);
  if (params.assignment) sp.set("assignment", params.assignment);
  if (params.pageSize != null) sp.set("pageSize", String(params.pageSize));
  const qs = sp.toString();
  return request(`/contracts/overview/modules-delivery/search${qs ? `?${qs}` : ""}`);
}

export type ContractModuleValidator = ContractLinkedUser & { role: string };

export async function getContractModuleValidators(): Promise<ContractModuleValidator[]> {
  return request("/contracts/module-validators");
}

export type UserOption = {
  id: string;
  name: string;
  email: string;
  organizationAcronym?: string | null;
  active: boolean;
};

/** Listagem leve para selects de usuários (fiscais, responsáveis, etc.). */
export async function getUserOptions(): Promise<UserOption[]> {
  return request("/users/options");
}

export type AttachmentRecord = {
  id: string;
  fileName: string;
  mimeType: string;
  filePath: string;
  createdAt: string;
};

export type MeasurementItemRow = {
  id: string;
  type: string;
  referenceId: string;
  pricingItemId?: string | null;
  quantity: string;
  calculatedValue: string;
  descriptionSnapshot?: string | null;
  unitValueSnapshot?: string | null;
  billingKindSnapshot?: string | null;
  periodicitySnapshot?: string | null;
  coverageStart?: string | null;
  coverageEnd?: string | null;
  calculationMemory?: Record<string, unknown> | null;
  isLegacyMonthly?: boolean;
  glosedValue?: string;
  pricingItem?: Pick<ContractPricingItem, "id" | "description" | "sequence" | "billingKind" | "unitValue"> | null;
};

export type MeasurementGlosaRow = {
  id: string;
  type: string;
  origin?: "AUTOMATIC" | "MANUAL" | string;
  value: string;
  justification: string;
  createdBy: string;
  createdAt: string;
  measurementItemId?: string | null;
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
  financialSummary?: {
    gross: string;
    automaticGlosas: string;
    manualGlosas: string;
    net: string;
  };
  contract?: {
    id: string;
    number?: string;
    name: string;
    internalCode?: string | null;
    formalNumber?: string | null;
    contractYear?: number | null;
    companyName?: string;
    contractType?: string;
    startDate?: string;
    endDate?: string;
    organization?: { id: string; name: string; acronym: string } | null;
    supplier?: { id: string; name: string; cnpj: string } | null;
    services?: Array<{ id: string; name: string; unit: string; unitValue: string }>;
    pricingItems?: ContractPricingItem[];
  };
  items?: MeasurementItemRow[];
  glosas?: MeasurementGlosaRow[];
  attachments?: Array<AttachmentRecord>;
};

export type Glosa = {
  id: string;
  measurementId: string;
  measurementItemId?: string | null;
  type: string;
  origin?: "AUTOMATIC" | "MANUAL" | string;
  value: string;
  /** Presente no detalhe; omitido na listagem para reduzir payload. */
  justification?: string;
  createdBy: string;
  createdAt: string;
  measurement?: {
    id: string;
    referenceMonth: number;
    referenceYear: number;
    contract?: { number?: string; internalCode?: string | null; name: string; formalNumber?: string | null };
  };
  measurementItem?: { id: string; descriptionSnapshot?: string | null; isLegacyMonthly?: boolean } | null;
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

export type SupplierContact = {
  name?: string;
  email: string;
  role?: string;
};

export type Supplier = {
  id: string;
  name: string;
  cnpj: string;
  contacts?: SupplierContact[] | null;
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

export type DeadlineOrigin =
  | "CONTRACT_END"
  | "SCHEDULE_STEP"
  | "OCCURRENCE"
  | "MEASUREMENT_PENDING"
  | "FEATURE_VALIDATION"
  | "GLPI_SLA"
  | "DOCUMENT"
  | "OTHER";

export type DeadlineStatus =
  | "FUTURE"
  | "NEAR_DUE"
  | "DUE_TODAY"
  | "OVERDUE"
  | "DONE_ON_TIME"
  | "DONE_LATE"
  | "SUSPENDED"
  | "EXTENDED"
  | "CANCELLED";

export type DeadlineAttentionLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type DeadlineItem = {
  id: string;
  origin: DeadlineOrigin;
  contractId: string | null;
  title: string;
  description: string | null;
  responsibleUserId: string | null;
  responsibleLabel: string | null;
  dueAt: string;
  status: DeadlineStatus;
  attentionLevel: DeadlineAttentionLevel;
  expectedAction: string | null;
  sourceEntityType: string;
  sourceEntityId: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  href: string | null;
  contract: {
    id: string;
    number: string;
    name: string;
    internalCode: string | null;
    formalNumber: string | null;
    organizationId: string | null;
  } | null;
};

export type DeadlineListResponse = {
  items: DeadlineItem[];
  summary: {
    totalOpen: number;
    byStatus: Record<string, number>;
    byOrigin: Record<string, number>;
    byAttention: Record<string, number>;
  };
};

export type DeadlineListParams = {
  origin?: string;
  status?: string;
  attentionLevel?: string;
  contractId?: string;
  responsibleUserId?: string;
  q?: string;
  includeCancelled?: boolean;
};

export async function getDeadlines(params: DeadlineListParams = {}): Promise<DeadlineListResponse> {
  const qs = new URLSearchParams();
  if (params.origin) qs.set("origin", params.origin);
  if (params.status) qs.set("status", params.status);
  if (params.attentionLevel) qs.set("attentionLevel", params.attentionLevel);
  if (params.contractId) qs.set("contractId", params.contractId);
  if (params.responsibleUserId) qs.set("responsibleUserId", params.responsibleUserId);
  if (params.q) qs.set("q", params.q);
  if (params.includeCancelled) qs.set("includeCancelled", "1");
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return request(`/deadlines${suffix}`);
}

export async function recalculateDeadlines(): Promise<{ upserted: number; cancelled: number; desired: number }> {
  return request("/deadlines/recalculate", { method: "POST", body: "{}" });
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

export type PricingItemsFinancialReportRow = {
  contractId: string;
  contractNumber: string;
  contractName: string;
  internalCode: string | null;
  organizationName: string | null;
  supplierName: string;
  itemId: string;
  sequence: number;
  typeCode: string;
  typeLabel: string;
  description: string;
  billingKind: ContractPricingBillingKind;
  unitLabel: string;
  quantity: string;
  consumedQuantity: string;
  availableBalance: string;
  unitValue: string;
  totalValue: string;
  status: ContractPricingItemStatus;
  measuredValueSum: string;
};

export async function getMonthlyContractClosureReport(year: number, month: number): Promise<MonthlyContractClosureRow[]> {
  const y = encodeURIComponent(String(year));
  const m = encodeURIComponent(String(month));
  return request(`/reports/monthly-contract-closure?year=${y}&month=${m}`);
}

export async function getPricingItemsFinancialReport(params: {
  organizationId?: string;
  status?: ContractPricingItemStatus;
  year?: number;
  month?: number;
} = {}): Promise<PricingItemsFinancialReportRow[]> {
  const query = new URLSearchParams();
  if (params.organizationId) query.set("organizationId", params.organizationId);
  if (params.status) query.set("status", params.status);
  if (params.year != null) query.set("year", String(params.year));
  if (params.month != null) query.set("month", String(params.month));
  const suffix = query.toString();
  return request(`/reports/pricing-items${suffix ? `?${suffix}` : ""}`);
}

export async function getContracts(): Promise<Contract[]> {
  return request("/contracts");
}

export async function getContract(id: string): Promise<Contract> {
  return request(`/contracts/${id}`);
}

export type ConsumptionMovementStatus =
  | "DRAFT"
  | "INFORMED"
  | "UNDER_VALIDATION"
  | "APPROVED"
  | "REJECTED"
  | "ADJUSTED"
  | "REVERSED";

export type ContractConsumptionSummaryItem = {
  id: string;
  sequence: number;
  description: string;
  unit?: MeasureUnitCatalog | null;
  financialUnit?: MeasureUnitCatalog | null;
  type?: ContractItemTypeCatalog | null;
  billingKind: ContractPricingBillingKind;
  financialRule: ConsumptionFinancialRule;
  availability?: string | null;
  accumulates?: boolean;
  requiresValidation?: boolean;
  configurationPending?: boolean;
  quantityContracted: string;
  quantityAvailableBase?: string;
  quantityApprovedUsed: string;
  quantityPendingValidation: string;
  quantityEstimatedOpen?: string;
  quantityAvailable: string;
  quantityProjectedAvailable?: string;
  quantityCommittedAvailable: string;
  consumedPercent: number;
  alertLevel: number | null;
  unitValue: string;
};

export type ConsumptionActivityStatus =
  | "SURVEY"
  | "AWAITING_APPROVAL"
  | "APPROVED_FOR_EXECUTION"
  | "IN_DEVELOPMENT"
  | "IN_VALIDATION"
  | "COMPLETED"
  | "CANCELLED"
  | "SUSPENDED";

export type ContractConsumptionMovement = {
  id: string;
  contractId: string;
  pricingItemId: string;
  quantity: string;
  estimatedQuantity?: string;
  originalQuantity?: string | null;
  unitCodeSnapshot?: string | null;
  unitLabelSnapshot?: string | null;
  status: ConsumptionMovementStatus;
  activityStatus?: ConsumptionActivityStatus;
  source: string;
  glpiTicketId?: number | null;
  measurementId?: string | null;
  executionDate: string;
  startDate?: string | null;
  responsibleLabel?: string | null;
  description?: string | null;
  notes?: string | null;
  pricingItem?: {
    id: string;
    description: string;
    sequence: number;
    unit?: { code: string; label: string } | null;
    type?: { code: string; label: string } | null;
  } | null;
};

export async function getContractConsumptions(
  contractId: string
): Promise<{ items: ContractConsumptionSummaryItem[] }> {
  return request(`/contracts/${contractId}/consumptions`);
}

export async function getContractConsumptionMovements(
  contractId: string,
  params?: { pricingItemId?: string; glpiTicketId?: number; status?: string; page?: number; pageSize?: number }
): Promise<{ items: ContractConsumptionMovement[]; total: number; page: number; pageSize: number; pageCount: number }> {
  const query = new URLSearchParams();
  if (params?.pricingItemId) query.set("pricingItemId", params.pricingItemId);
  if (params?.glpiTicketId != null) query.set("glpiTicketId", String(params.glpiTicketId));
  if (params?.status) query.set("status", params.status);
  if (params?.page != null) query.set("page", String(params.page));
  if (params?.pageSize != null) query.set("pageSize", String(params.pageSize));
  const suffix = query.toString();
  return request(`/contracts/${contractId}/consumptions/movements${suffix ? `?${suffix}` : ""}`);
}

export async function createContractConsumptionMovement(
  contractId: string,
  payload: {
    pricingItemId: string;
    quantity?: number;
    estimatedQuantity?: number;
    activityStatus?: ConsumptionActivityStatus;
    executionDate: string;
    startDate?: string | null;
    description?: string | null;
    notes?: string | null;
    responsibleLabel?: string | null;
    responsibleUserId?: string | null;
    glpiTicketId?: number | null;
    submitForValidation?: boolean;
  }
): Promise<ContractConsumptionMovement> {
  return request(`/contracts/${contractId}/consumptions/movements`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function validateContractConsumptionMovement(
  contractId: string,
  movementId: string,
  payload: {
    action: "approve" | "reject" | "adjust";
    quantity?: number;
    justification?: string | null;
    rejectionReason?: string | null;
  }
): Promise<ContractConsumptionMovement> {
  return request(`/contracts/${contractId}/consumptions/movements/${movementId}/validate`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function reverseContractConsumptionMovement(
  contractId: string,
  movementId: string,
  payload?: { justification?: string | null }
): Promise<ContractConsumptionMovement> {
  return request(`/contracts/${contractId}/consumptions/movements/${movementId}/reverse`, {
    method: "POST",
    body: JSON.stringify(payload ?? {})
  });
}

export async function getContractItemChangeLogs(contractId: string): Promise<ContractItemChangeLog[]> {
  return request(`/contracts/${contractId}/item-change-logs`);
}

/** Carga leve do contrato para o formulário de edição (sem cronogramas/ocorrências). */
export async function getContractFormData(id: string): Promise<Contract> {
  return request(`/contracts/${id}/form-data`);
}

/** Registra falha de carregamento do formulário nos logs administrativos. */
export async function reportContractFormLoadFailure(payload: {
  action: "create" | "edit";
  contractId?: string | null;
  stage: string;
  message?: string;
}): Promise<{ ok: true }> {
  return request("/contracts/form-load-failure", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function createContractAmendment(
  contractId: string,
  payload: CreateContractAmendmentPayload
): Promise<Contract> {
  return request(`/contracts/${contractId}/amendments`, { method: "POST", body: JSON.stringify(payload) });
}

export async function cancelContractAmendment(
  contractId: string,
  amendmentId: string,
  justification: string
): Promise<Contract> {
  return request(`/contracts/${contractId}/amendments/${amendmentId}/cancel`, {
    method: "POST",
    body: JSON.stringify({ justification })
  });
}

export async function deleteContract(
  contractId: string,
  payload: { confirmation: string; justification: string }
): Promise<{ ok: true; id: string }> {
  return request(`/contracts/${contractId}`, {
    method: "DELETE",
    body: JSON.stringify(payload)
  });
}

/** Emite excepcionalmente um novo código interno, registrando o anterior e a justificativa em auditoria. */
export async function regenerateContractInternalCode(contractId: string, justification: string): Promise<Contract> {
  return request(`/contracts/${contractId}/regenerate-internal-code`, {
    method: "POST",
    body: JSON.stringify({ justification })
  });
}

export async function updateContract(
  contractId: string,
  payload: {
    number?: string;
    formalNumber?: string | null;
    administrativeProcess?: string | null;
    organizationId?: string | null;
    contractTypeCatalogId?: string | null;
    hiringTypeId?: string | null;
    hiringProcedureNumber?: string | null;
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
    globalValueManual?: boolean;
    globalValueCurrent?: number;
    globalValueJustification?: string | null;
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
    /** Substitui integralmente os itens de precificação quando informado. */
    pricingItems?: ContractPricingItemInput[];
  }
): Promise<Contract> {
  return request(`/contracts/${contractId}`, { method: "PUT", body: JSON.stringify(payload) });
}

export async function createContract(payload: {
  number?: string;
  formalNumber?: string;
  administrativeProcess?: string | null;
  organizationId?: string | null;
  contractTypeCatalogId?: string | null;
  hiringTypeId?: string | null;
  hiringProcedureNumber?: string | null;
  name: string;
  description?: string;
  managingUnit?: string | null;
  companyName: string;
  cnpj: string;
  contractType: "SOFTWARE" | "DATACENTER" | "INFRA" | "SERVICO";
  lawType?: "LEI_8666" | "LEI_14133";
  startDate: string;
  endDate: string;
  totalValue?: number;
  globalValueManual?: boolean;
  globalValueCurrent?: number;
  globalValueJustification?: string;
  monthlyValue?: number;
  installationValue?: number | null;
  implementationPeriodStart?: string;
  implementationPeriodEnd?: string;
  status?: "ACTIVE" | "EXPIRED" | "SUSPENDED";
  slaTarget?: number;
  fiscalId: string;
  managerId?: string;
  supplierId?: string;
  glpiGroups?: Array<{ glpiGroupId: number; glpiGroupName?: string }>;
  pricingItems?: ContractPricingItemInput[];
}): Promise<Contract> {
  return request("/contracts", { method: "POST", body: JSON.stringify(payload) });
}

export async function getContractPricingCatalog(): Promise<ContractPricingCatalog> {
  return request("/contracts/catalog/pricing");
}

export type PricingMigrationReviewItem = {
  id: string;
  description: string;
  typeCode: string;
  quantity: number;
  unitValue: number;
  totalValue: number;
};

export type PricingMigrationReviewContract = {
  id: string;
  name: string;
  number: string;
  status: string;
  monthlyValue: number;
  installationValue: number | null;
  totalValue: number;
  pricingItemsCount: number;
  mensalidadeCount: number;
  implantacaoCount: number;
  flags: string[];
  migratedItems: PricingMigrationReviewItem[];
};

export type PricingMigrationReview = {
  summary: { migrated: number; pending: number; inconsistent: number; totalActive: number };
  contracts: PricingMigrationReviewContract[];
};

/** Conferência administrativa da migração dos valores legados para os itens contratuais. */
export async function getPricingMigrationReview(): Promise<PricingMigrationReview> {
  return request("/contracts/pricing-migration-review");
}

export type IdentificationIssue =
  | "MISSING_FORMAL_NUMBER"
  | "MISSING_CONTRACT_TYPE"
  | "MISSING_ADMIN_PROCESS"
  | "MISSING_HIRING_TYPE"
  | "MISSING_START_DATE"
  | "YEAR_MISMATCH"
  | "ORGANIZATION_PENDING"
  | "MISSING_INTERNAL_CODE";

export type IdentificationMigrationReviewContract = {
  id: string;
  name: string;
  number: string;
  status: string;
  internalCode: string | null;
  formalNumber: string | null;
  contractYear: number | null;
  administrativeProcess: string | null;
  hiringProcedureNumber: string | null;
  startDate: string | null;
  organizationPending: boolean;
  organizationName: string | null;
  contractTypeName: string | null;
  hiringTypeName: string | null;
  issues: IdentificationIssue[];
};

export type IdentificationMigrationReview = {
  summary: {
    total: number;
    withIssues: number;
    missingFormal: number;
    missingType: number;
    missingProcess: number;
    missingHiringType: number;
    yearMismatch: number;
    missingStartDate: number;
    organizationPending: number;
    missingInternalCode: number;
  };
  contracts: IdentificationMigrationReviewContract[];
};

/** Conferência administrativa da migração de identificação dos contratos. */
export async function getIdentificationMigrationReview(): Promise<IdentificationMigrationReview> {
  return request("/contracts/identification-migration-review");
}

/** Reaplica somente correções seguras de identificação (admin). */
export async function repairIdentificationMigration(): Promise<{ scanned: number; updated: number }> {
  return request("/contracts/identification-migration-repair", { method: "POST", body: "{}" });
}

export async function createMeasureUnit(payload: { code: string; label: string }): Promise<MeasureUnitCatalog> {
  return request("/contracts/catalog/measure-units", { method: "POST", body: JSON.stringify(payload) });
}

export async function createContractItemType(payload: {
  code: string;
  label: string;
}): Promise<ContractItemTypeCatalog> {
  return request("/contracts/catalog/item-types", { method: "POST", body: JSON.stringify(payload) });
}

export async function replaceContractPricingItems(
  contractId: string,
  items: ContractPricingItemInput[]
): Promise<{ items: ContractPricingItem[]; totals: ContractPricingTotals }> {
  return request(`/contracts/${contractId}/pricing-items`, {
    method: "PUT",
    body: JSON.stringify({ items })
  });
}

export type ContractFeatureStatus = "NOT_STARTED" | "IN_PROGRESS" | "DELIVERED" | "VALIDATED";

export async function createContractModule(
  contractId: string,
  payload: {
    name: string;
    weight?: number;
    criticality?: ContractItemCriticality;
    validatorId?: string | null;
    fiscalUserIds?: string[];
    glosaPricingItemId?: string | null;
  }
): Promise<Contract> {
  return request(`/contracts/${contractId}/modules`, { method: "POST", body: JSON.stringify(payload) });
}

export async function updateContractModule(
  contractId: string,
  moduleId: string,
  payload: {
    name?: string;
    weight?: number;
    criticality?: ContractItemCriticality;
    validatorId?: string | null;
    fiscalUserIds?: string[];
    glosaPricingItemId?: string | null;
  }
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
    validationGroupId: string;
    responsibleUserIds?: string[];
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
    validationGroupId?: string | null;
    responsibleUserIds?: string[];
    /** Origem para auditoria (ex.: MODULES_SIMPLIFIED). */
    changeSource?: string;
  }
): Promise<Contract> {
  return request(`/contracts/${contractId}/modules/${moduleId}/features/${featureId}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function createContractValidationGroup(
  contractId: string,
  payload: {
    name: string;
    description?: string | null;
    active?: boolean;
    memberUserIds?: string[];
  }
): Promise<Contract> {
  return request(`/contracts/${contractId}/validation-groups`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateContractValidationGroup(
  contractId: string,
  groupId: string,
  payload: {
    name?: string;
    description?: string | null;
    active?: boolean;
    memberUserIds?: string[];
  }
): Promise<Contract> {
  return request(`/contracts/${contractId}/validation-groups/${groupId}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function deleteContractValidationGroup(contractId: string, groupId: string): Promise<Contract> {
  return request(`/contracts/${contractId}/validation-groups/${groupId}`, { method: "DELETE" });
}

export async function createContractSchedule(
  contractId: string,
  payload: CreateContractSchedulePayload
): Promise<Contract> {
  return request(`/contracts/${contractId}/schedules`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateContractSchedule(
  contractId: string,
  scheduleId: string,
  payload: UpdateContractSchedulePayload
): Promise<Contract> {
  return request(`/contracts/${contractId}/schedules/${scheduleId}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function approveContractSchedule(contractId: string, scheduleId: string): Promise<Contract> {
  return request(`/contracts/${contractId}/schedules/${scheduleId}/approve`, { method: "POST" });
}

export async function deleteContractSchedule(contractId: string, scheduleId: string): Promise<Contract> {
  return request(`/contracts/${contractId}/schedules/${scheduleId}`, { method: "DELETE" });
}


export async function createContractOccurrence(
  contractId: string,
  payload: CreateContractOccurrencePayload
): Promise<Contract> {
  return request(`/contracts/${contractId}/occurrences`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateContractOccurrence(
  contractId: string,
  occurrenceId: string,
  payload: UpdateContractOccurrencePayload
): Promise<Contract> {
  return request(`/contracts/${contractId}/occurrences/${occurrenceId}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function changeContractOccurrenceStatus(
  contractId: string,
  occurrenceId: string,
  payload: ChangeContractOccurrenceStatusPayload
): Promise<Contract> {
  return request(`/contracts/${contractId}/occurrences/${occurrenceId}/status`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function forwardOccurrenceToControladoria(
  contractId: string,
  occurrenceId: string,
  payload: ForwardOccurrenceToControladoriaPayload
): Promise<Contract> {
  return request(`/contracts/${contractId}/occurrences/${occurrenceId}/forward-controladoria`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function deleteContractOccurrence(contractId: string, occurrenceId: string): Promise<Contract> {
  return request(`/contracts/${contractId}/occurrences/${occurrenceId}`, { method: "DELETE" });
}

export async function updateContractControladoriaCase(
  contractId: string,
  caseId: string,
  payload: UpdateContractControladoriaCasePayload
): Promise<Contract> {
  return request(`/contracts/${contractId}/controladoria-cases/${caseId}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function listAllControladoriaCases(take = 100): Promise<ContractControladoriaCase[]> {
  return request(`/controladoria-cases?take=${take}`);
}


export async function bulkUpdateFeatureValidationGroup(
  contractId: string,
  payload: { featureIds: string[]; validationGroupId?: string | null }
): Promise<Contract> {
  return request(`/contracts/${contractId}/features/bulk-validation-group`, {
    method: "POST",
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

/** Download do ficheiro (cookie de sessão). Use `inline=1` para pré-visualização no navegador (PDF/imagens). */
export function attachmentDownloadUrl(
  attachmentId: string,
  options?: { inline?: boolean }
): string {
  const q = options?.inline ? "?inline=1" : "";
  return `/api/attachments/${attachmentId}/download${q}`;
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

export async function deleteMeasurementAttachment(measurementId: string, attachmentId: string): Promise<{ ok: true }> {
  return request(`/measurements/${measurementId}/attachments/${attachmentId}`, { method: "DELETE" });
}

export async function deleteGlosaAttachment(glosaId: string, attachmentId: string): Promise<{ ok: true }> {
  return request(`/glosas/${glosaId}/attachments/${attachmentId}`, { method: "DELETE" });
}

export async function uploadScheduleAttachment(
  contractId: string,
  scheduleId: string,
  file: File
): Promise<AttachmentRecord> {
  const form = new FormData();
  form.append("file", file);
  const t = readBrowserAuthToken();
  const headers: HeadersInit = t ? { Authorization: `Bearer ${t}` } : {};
  const apiBase = await resolveRequestApiBase();
  const response = await fetch(
    `${apiBase}/contracts/${contractId}/schedules/${scheduleId}/attachments`,
    {
      method: "POST",
      headers,
      body: form,
      cache: "no-store"
    }
  );
  if (!response.ok) {
    throw new Error(await parseUploadError(response));
  }
  return (await response.json()) as AttachmentRecord;
}

export async function deleteScheduleAttachment(
  contractId: string,
  scheduleId: string,
  attachmentId: string
): Promise<{ ok: true }> {
  return request(
    `/contracts/${contractId}/schedules/${scheduleId}/attachments/${attachmentId}`,
    { method: "DELETE" }
  );
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
  items: Array<{ type: "SERVICE"; referenceId: string; quantity: number; pricingItemId?: string }>
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
  type: "ATRASO" | "NAO_ENTREGA" | "SLA" | "QUALIDADE" | string;
  value: number;
  justification: string;
  createdBy?: string;
  measurementItemId?: string;
}): Promise<Glosa> {
  return request("/glosas", { method: "POST", body: JSON.stringify(payload) });
}

/** Glosa manual pela tela da medição (caminho preferencial). */
export async function addMeasurementGlosa(
  measurementId: string,
  payload: {
    type: string;
    value: number;
    justification: string;
    measurementItemId?: string;
    createdBy?: string;
  }
): Promise<Measurement> {
  return request(`/measurements/${measurementId}/glosas`, { method: "POST", body: JSON.stringify(payload) });
}

export async function getSuppliers(): Promise<Supplier[]> {
  return request("/suppliers");
}

export async function createSupplier(payload: {
  name: string;
  cnpj: string;
  contacts?: SupplierContact[];
}): Promise<Supplier> {
  return request("/suppliers", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateSupplier(
  id: string,
  payload: {
    name?: string;
    cnpj?: string;
    contacts?: SupplierContact[] | null;
  }
): Promise<Supplier> {
  return request(`/suppliers/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
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

export type AuthMeProfile = {
  id: string;
  name: string;
  systemKey: string | null;
};

export type AuthMeOrganization = {
  id: string;
  name: string;
  acronym: string;
};

export type AuthMeActiveContext = {
  profileId: string;
  profileName: string;
  systemKey: string | null;
  role: string;
  organizationId: string | null;
  organizationLabel: string;
  allOrganizationsActive: boolean;
};

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
  allOrganizations?: boolean;
  profiles?: AuthMeProfile[];
  organizations?: AuthMeOrganization[];
  activeContext?: AuthMeActiveContext;
  userKind?: "INTERNAL" | "EXTERNAL";
  supplier?: { id: string; name: string; cnpj: string } | null;
  authorizedContractIds?: string[];
  externalFunction?: string | null;
};

export async function getAuthMe(): Promise<AuthMe> {
  return request("/auth/me");
}

export async function switchAccessContext(payload: {
  profileId: string;
  organizationId?: string | null;
}): Promise<AuthMe & { access_token?: string; expires_in?: string }> {
  return request("/auth/context", { method: "POST", body: JSON.stringify(payload) });
}

export type MyPermissions = {
  keys: string[];
  role: string;
  profileId?: string | null;
};

export async function getMyPermissions(): Promise<MyPermissions> {
  return request("/permissions/me");
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
    pendingFeatures: number;
    projects: number;
    tasks: number;
    governanceTickets: number;
    glpiTickets: number;
  };
  listLimits: {
    maxItemsPerList: number;
    tasksTruncated: boolean;
    governanceTruncated: boolean;
    glpiTruncated: boolean;
    pendingFeaturesTruncated?: boolean;
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
    role?: "acompanhamento";
    contract: { id: string; number: string; name: string; status: string };
  }>;
  pendingFeatures: Array<{
    id: string;
    itemCode?: string | null;
    name: string;
    deliveryStatus: string;
    criticality: string;
    validationGroup?: { id: string; name: string } | null;
    assignmentReasons: Array<"GROUP" | "FEATURE">;
    module: { id: string; name: string };
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

export type UserAccessProfileLink = {
  id: string;
  name: string;
  systemKey: string | null;
  active: boolean;
  isDefault: boolean;
};

export type UserOrganizationLink = {
  id: string;
  name: string;
  acronym: string;
  active: boolean;
  isDefault: boolean;
};

export type UserRecord = {
  id: string;
  email: string;
  cpfMasked?: string | null;
  cpfDigits?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  profileColor?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  phone?: string | null;
  organizationId?: string | null;
  organization?: { id: string; name: string; acronym: string; active: boolean } | null;
  allOrganizations?: boolean;
  defaultProfileId?: string | null;
  defaultOrganizationId?: string | null;
  profiles?: UserAccessProfileLink[];
  organizations?: UserOrganizationLink[];
  profileSummary?: string | null;
  organizationSummary?: string | null;
  role: string;
  approvalStatus?: "PENDING" | "APPROVED" | "REJECTED";
  approvalRejectionReason?: string | null;
  mustChangePassword?: boolean;
  userKind?: "INTERNAL" | "EXTERNAL";
  supplierId?: string | null;
  supplier?: { id: string; name: string; cnpj: string } | null;
  externalFunction?: string | null;
  authorizedContractIds?: string[];
  authorizedContracts?: Array<{ id: string; number: string; name: string; internalCode?: string | null }>;
  createdAt: string;
  updatedAt: string;
};

export async function getUsers(): Promise<UserRecord[]> {
  return request("/users");
}

export type AuditLogSource = "AUDIT" | "ACCESS";

export type AuditLogListItem = {
  id: string;
  source: AuditLogSource;
  occurredAt: string;
  action: string;
  entity: string;
  entityId: string | null;
  actorId: string | null;
  actorLabel: string;
  description: string;
  hasDiff: boolean;
  originHref: string | null;
  oldData?: unknown;
  newData?: unknown;
  metadata?: unknown;
};

export type AuditLogListResponse = {
  items: AuditLogListItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type AuditLogListParams = {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
  actor?: string;
  action?: string;
  entity?: string;
  q?: string;
  source?: "ALL" | AuditLogSource;
};

function auditLogsQueryString(params: AuditLogListParams = {}): string {
  const sp = new URLSearchParams();
  if (params.page != null) sp.set("page", String(params.page));
  if (params.limit != null) sp.set("limit", String(params.limit));
  if (params.from) sp.set("from", params.from);
  if (params.to) sp.set("to", params.to);
  if (params.actor) sp.set("actor", params.actor);
  if (params.action) sp.set("action", params.action);
  if (params.entity) sp.set("entity", params.entity);
  if (params.q) sp.set("q", params.q);
  if (params.source && params.source !== "ALL") sp.set("source", params.source);
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

/** Lista paginada de auditoria + login/logout (ADMIN). */
export async function getAuditLogs(params: AuditLogListParams = {}): Promise<AuditLogListResponse> {
  return request(`/admin/audit-logs${auditLogsQueryString(params)}`);
}

/** Detalhe de um registro de auditoria ou evento de acesso (ADMIN). */
export async function getAuditLogDetail(id: string, source?: AuditLogSource): Promise<AuditLogListItem> {
  const qs = source ? `?source=${encodeURIComponent(source)}` : "";
  return request(`/admin/audit-logs/${encodeURIComponent(id)}${qs}`);
}

/** CSV dos resultados filtrados de auditoria (ADMIN; até 10 mil linhas). */
export async function fetchAuditLogsCsvBlob(params: AuditLogListParams = {}): Promise<Blob> {
  return fetchExportCsvBlob(`/admin/audit-logs/export.csv${auditLogsQueryString(params)}`, "auditoria");
}

export type AuditDetailLevel = "ACTION_ONLY" | "ACTION_AND_VALUES";

export type AuditEventConfigItem = {
  id: string;
  moduleKey: string;
  screenKey: string;
  actionKey: string;
  label: string;
  enabled: boolean;
  detailLevel: AuditDetailLevel;
  mandatory: boolean;
  sortOrder: number;
};

export type AuditEventConfigModule = {
  moduleKey: string;
  moduleLabel: string;
  events: AuditEventConfigItem[];
};

export type AuditEventConfigResponse = {
  modules: AuditEventConfigModule[];
  total: number;
  enabledCount: number;
};

export type AuditEventConfigSaveResult = {
  ok: true;
  summary: { total: number; enabled: number; disabled: number; changed: number };
};

export type AuditEventConfigRestoreResult = {
  ok: true;
  summary: { total: number; enabled: number; disabled: number; restored: number };
};

/** Preferências de eventos de auditoria (ADMIN). */
export async function getAuditEventConfig(): Promise<AuditEventConfigResponse> {
  return request("/admin/audit-logs/event-config");
}

export async function saveAuditEventConfig(payload: {
  items: Array<{ id: string; enabled: boolean; detailLevel?: string }>;
}): Promise<AuditEventConfigSaveResult> {
  return request("/admin/audit-logs/event-config", {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function restoreAuditEventConfigDefaults(): Promise<AuditEventConfigRestoreResult> {
  return request("/admin/audit-logs/event-config/restore-defaults", { method: "POST" });
}

export type AuditStorageIndicators = {
  totalAuditLogs: number;
  totalAccessEvents: number;
  generatedThisMonth: number;
  oldestAuditAt: string | null;
  oldestAccessAt: string | null;
  topEntities: Array<{ entity: string; count: number }>;
  discardEnabled: boolean;
};

export type AuditRetentionPolicyItem = {
  id: string;
  categoryKey: string;
  label: string;
  retentionDays: number;
  minRetentionDays: number;
  active: boolean;
  sortOrder: number;
  updatedAt: string;
};

export type AuditRetentionPoliciesResponse = {
  policies: AuditRetentionPolicyItem[];
  discardGloballyOff: boolean;
  validationAlert: string;
};

export type AuditRetentionRunItem = {
  id: string;
  mode: string;
  status: string;
  categories: unknown;
  deletedCount: number;
  previewCount: number;
  periodFrom: string | null;
  periodTo: string | null;
  actorUserId: string | null;
  summary: unknown;
  errorSummary: string | null;
  createdAt: string;
};

export type AuditRetentionDiscardResult = {
  ok: boolean;
  mode: "DRY_RUN" | "EXECUTE";
  status: string;
  previewCount: number;
  deletedCount: number;
  byCategory: Array<{ categoryKey: string; count: number; cutoffAt: string }>;
  preservedNote: string;
  runId: string;
  message: string;
};

export async function getAuditStorageIndicators(): Promise<AuditStorageIndicators> {
  return request("/admin/audit-logs/retention/indicators");
}

export async function getAuditRetentionPolicies(): Promise<AuditRetentionPoliciesResponse> {
  return request("/admin/audit-logs/retention");
}

export async function saveAuditRetentionPolicies(payload: {
  items: Array<{ id: string; retentionDays: number; active: boolean }>;
}): Promise<{ ok: true; changed: number }> {
  return request("/admin/audit-logs/retention", {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function getAuditRetentionRuns(limit = 20): Promise<AuditRetentionRunItem[]> {
  return request(`/admin/audit-logs/retention/runs?limit=${encodeURIComponent(String(limit))}`);
}

export async function dryRunAuditRetention(): Promise<AuditRetentionDiscardResult> {
  return request("/admin/audit-logs/retention/dry-run", { method: "POST" });
}

export async function executeAuditRetentionDiscard(): Promise<AuditRetentionDiscardResult> {
  return request("/admin/audit-logs/retention/execute", {
    method: "POST",
    body: JSON.stringify({ confirmed: true })
  });
}

export type EmailOutboundPublicConfig = {
  active: boolean;
  status: "NOT_CONFIGURED" | "CONFIGURED_UNTESTED" | "TEST_OK" | "ACTIVE" | "FAILED";
  smtpHost: string;
  smtpPort: number;
  security: "NONE" | "STARTTLS" | "SSL_TLS";
  authRequired: boolean;
  username: string;
  hasPassword: boolean;
  credentialConfigured: boolean;
  authMethod: "USER_PASS" | "APP_PASSWORD" | "OAUTH";
  oauthClientId: string;
  oauthTenantId: string;
  hasOauthRefreshToken: boolean;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  ccDefault: string;
  bccDefault: string;
  failureAlertEmail: string;
  subjectPrefix: string;
  footerSignature: string;
  confidentialityText: string;
  maxAttachmentBytes: number;
  maxRecipients: number;
  retryIntervalSec: number;
  maxRetries: number;
  attachNotificationPdf: boolean;
  attachmentsAsLink: boolean;
  requirePortalAccess: boolean;
  inboundEnabled: boolean;
  imapHost: string;
  imapPort: number;
  imapSecurity: "NONE" | "STARTTLS" | "SSL_TLS";
  imapUsername: string;
  hasImapPassword: boolean;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
  lastTestRecipient: string | null;
  activationJustification: string | null;
  updatedAt: string;
};

export type EmailOutboundConfigPayload = {
  smtpHost: string;
  smtpPort: number;
  security: "NONE" | "STARTTLS" | "SSL_TLS";
  authRequired: boolean;
  username: string;
  password?: string;
  authMethod: "USER_PASS" | "APP_PASSWORD" | "OAUTH";
  oauthClientId?: string | null;
  oauthTenantId?: string | null;
  oauthRefreshToken?: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  ccDefault?: string;
  bccDefault?: string;
  failureAlertEmail?: string;
  subjectPrefix?: string;
  footerSignature?: string;
  confidentialityText?: string;
  maxAttachmentBytes?: number;
  maxRecipients?: number;
  retryIntervalSec?: number;
  maxRetries?: number;
  attachNotificationPdf?: boolean;
  attachmentsAsLink?: boolean;
  requirePortalAccess?: boolean;
  active?: boolean;
  activationJustification?: string | null;
  imapHost?: string;
  imapPort?: number;
  imapSecurity?: "NONE" | "STARTTLS" | "SSL_TLS";
  imapUsername?: string;
  imapPassword?: string;
};

export type EmailSendLogItem = {
  id: string;
  type: string;
  recipients: string;
  status: string;
  attempts: number;
  errorSummary: string | null;
  createdAt: string;
};

async function parseAdminJsonError(res: Response, fallback: string): Promise<never> {
  let detail = "";
  try {
    const payload = (await res.json()) as { message?: string };
    detail = typeof payload.message === "string" ? payload.message : "";
  } catch {
    detail = "";
  }
  throw new Error(detail || `${fallback} (${res.status})`);
}

/** Configuração SMTP de saída (ADMIN). */
export async function getEmailOutboundConfig(): Promise<EmailOutboundPublicConfig> {
  const apiBase = await resolveRequestApiBase();
  const auth = await authHeadersForApi();
  const res = await fetch(`${apiBase}/admin/email-outbound`, { headers: { ...auth }, cache: "no-store" });
  if (!res.ok) await parseAdminJsonError(res, "Falha ao obter configuração de e-mail");
  const data = (await res.json()) as EmailOutboundPublicConfig & { ok?: boolean };
  return data;
}

export async function saveEmailOutboundConfig(
  payload: EmailOutboundConfigPayload
): Promise<EmailOutboundPublicConfig> {
  const apiBase = await resolveRequestApiBase();
  const auth = await authHeadersForApi();
  const res = await fetch(`${apiBase}/admin/email-outbound`, {
    method: "PUT",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store"
  });
  if (!res.ok) await parseAdminJsonError(res, "Falha ao salvar configuração de e-mail");
  return (await res.json()) as EmailOutboundPublicConfig;
}

export async function testEmailOutbound(to: string): Promise<{
  ok: boolean;
  message: string;
  logId: string;
  config: EmailOutboundPublicConfig;
}> {
  const apiBase = await resolveRequestApiBase();
  const auth = await authHeadersForApi();
  const res = await fetch(`${apiBase}/admin/email-outbound/test`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ to }),
    cache: "no-store"
  });
  if (!res.ok) await parseAdminJsonError(res, "Falha ao testar e-mail");
  return (await res.json()) as {
    ok: boolean;
    message: string;
    logId: string;
    config: EmailOutboundPublicConfig;
  };
}

export async function getEmailOutboundLogs(limit = 20): Promise<EmailSendLogItem[]> {
  const apiBase = await resolveRequestApiBase();
  const auth = await authHeadersForApi();
  const res = await fetch(`${apiBase}/admin/email-outbound/logs?limit=${encodeURIComponent(String(limit))}`, {
    headers: { ...auth },
    cache: "no-store"
  });
  if (!res.ok) await parseAdminJsonError(res, "Falha ao listar histórico de e-mails");
  const data = (await res.json()) as { items?: EmailSendLogItem[] };
  return data.items ?? [];
}

export async function createUser(payload: {
  email: string;
  password: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  cpf?: string;
  organizationId?: string;
  role?: "ADMIN" | "EDITOR" | "VIEWER";
  profileIds?: string[];
  organizationIds?: string[];
  allOrganizations?: boolean;
  defaultProfileId?: string;
  defaultOrganizationId?: string | null;
  userKind?: "INTERNAL" | "EXTERNAL";
  supplierId?: string;
  externalFunction?: string;
  authorizedContractIds?: string[];
}): Promise<UserRecord> {
  return request("/users", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateUser(
  id: string,
  payload: {
    fullName?: string;
    firstName?: string;
    lastName?: string;
    cpf?: string | null;
    organizationId?: string | null;
    role?: "ADMIN" | "EDITOR" | "VIEWER";
    profileIds?: string[];
    organizationIds?: string[];
    allOrganizations?: boolean;
    defaultProfileId?: string;
    defaultOrganizationId?: string | null;
    password?: string;
    approvalStatus?: "PENDING" | "APPROVED" | "REJECTED";
    approvalRejectionReason?: string | null;
    userKind?: "INTERNAL" | "EXTERNAL";
    supplierId?: string | null;
    externalFunction?: string | null;
    authorizedContractIds?: string[];
  }
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

export type SystemBackupEnvItem = { key: string; present: boolean };

export type SystemBackupInfo = {
  ok: boolean;
  formatVersion: number;
  confirmPhrase: string;
  maxUploadMb: number;
  envKeysTracked: string[];
  envChecklist: SystemBackupEnvItem[];
  notes: string[];
};

export type SystemBackupImportResult = {
  ok: boolean;
  message: string;
  databaseRestored: boolean;
  uploadsRestored: boolean;
  envChecklist: SystemBackupEnvItem[];
  warnings: string[];
};

/** Metadados e checklist de variáveis (ADMIN). */
export async function getSystemBackupInfo(): Promise<SystemBackupInfo> {
  const apiBase = await resolveRequestApiBase();
  const auth = await authHeadersForApi();
  const res = await fetch(`${apiBase}/admin/backup`, { headers: { ...auth }, cache: "no-store" });
  if (!res.ok) {
    let detail = "";
    try {
      const payload = (await res.json()) as { message?: string };
      detail = typeof payload.message === "string" ? payload.message : "";
    } catch {
      detail = "";
    }
    throw new Error(detail || `Falha ao obter informações de backup (${res.status})`);
  }
  return (await res.json()) as SystemBackupInfo;
}

/** Descarrega pacote .tar.gz de backup do sistema (ADMIN). */
export async function fetchSystemBackupBlob(
  includeUploads: boolean
): Promise<{ blob: Blob; filename: string }> {
  const apiBase = await resolveRequestApiBase();
  const auth = await authHeadersForApi();
  const q = includeUploads ? "?uploads=1" : "?uploads=0";
  const res = await fetch(`${apiBase}/admin/backup/export${q}`, {
    headers: { ...auth },
    cache: "no-store"
  });
  if (!res.ok) {
    let detail = "";
    try {
      const payload = (await res.json()) as { message?: string };
      detail = typeof payload.message === "string" ? payload.message : "";
    } catch {
      detail = "";
    }
    throw new Error(detail || `Falha ao exportar backup (${res.status})`);
  }
  const cd = res.headers.get("Content-Disposition") || "";
  const match = /filename="([^"]+)"/i.exec(cd);
  const filename = match?.[1] || `gti-backup-${Date.now()}.tar.gz`;
  return { blob: await res.blob(), filename };
}

/** Restaura pacote de backup (ADMIN). confirm deve ser «RESTAURAR». */
export async function importSystemBackup(
  file: File,
  options: { confirm: string; restoreUploads: boolean }
): Promise<SystemBackupImportResult> {
  const apiBase = await resolveRequestApiBase();
  const auth = await authHeadersForApi();
  const form = new FormData();
  form.append("file", file);
  form.append("confirm", options.confirm);
  form.append("restoreUploads", options.restoreUploads ? "true" : "false");
  const res = await fetch(`${apiBase}/admin/backup/import`, {
    method: "POST",
    headers: { ...auth },
    body: form,
    cache: "no-store"
  });
  if (!res.ok) {
    let detail = "";
    try {
      const payload = (await res.json()) as { message?: string };
      detail = typeof payload.message === "string" ? payload.message : "";
    } catch {
      detail = "";
    }
    throw new Error(detail || `Falha na restauração (${res.status})`);
  }
  return (await res.json()) as SystemBackupImportResult;
}

export type S3BackupStatus = {
  ok: boolean;
  enabled: boolean;
  configured: boolean;
  hasSecret: boolean;
  status: "ativo" | "desabilitado" | "incompleto" | "em_execucao";
  bucket: string;
  region: string;
  accessKeyId: string;
  endpoint: string | null;
  forcePathStyle: boolean;
  prefix: string;
  hour: number;
  timezone: string;
  cron: string;
  cronRegistered: boolean;
  keepDaily: number;
  keepWeekly: number;
  keepMonthly: number;
  running: boolean;
  lastRun: {
    at: string;
    ok: boolean;
    error?: string;
    triggeredBy: "cron" | "manual";
    objectKey?: string | null;
    bytes?: number | null;
  } | null;
};

export type S3BackupConfigPayload = {
  enabled: boolean;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey?: string;
  endpoint?: string | null;
  forcePathStyle?: boolean;
  prefix: string;
  hour: number;
  timezone: string;
  keepDaily: number;
  keepWeekly: number;
  keepMonthly: number;
};

export type S3BackupObjectItem = {
  tier: "daily" | "weekly" | "monthly";
  key: string;
  size: number;
  lastModified: string | null;
};

async function parseBackupError(res: Response, fallback: string): Promise<never> {
  let detail = "";
  try {
    const payload = (await res.json()) as { message?: string };
    detail = typeof payload.message === "string" ? payload.message : "";
  } catch {
    detail = "";
  }
  throw new Error(detail || `${fallback} (${res.status})`);
}

export async function getS3BackupStatus(): Promise<S3BackupStatus> {
  const apiBase = await resolveRequestApiBase();
  const auth = await authHeadersForApi();
  const res = await fetch(`${apiBase}/admin/backup/s3`, { headers: { ...auth }, cache: "no-store" });
  if (!res.ok) await parseBackupError(res, "Falha ao obter status S3");
  return (await res.json()) as S3BackupStatus;
}

export async function saveS3BackupConfig(payload: S3BackupConfigPayload): Promise<S3BackupStatus> {
  const apiBase = await resolveRequestApiBase();
  const auth = await authHeadersForApi();
  const res = await fetch(`${apiBase}/admin/backup/s3`, {
    method: "PUT",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store"
  });
  if (!res.ok) await parseBackupError(res, "Falha ao salvar configuração S3");
  return (await res.json()) as S3BackupStatus;
}

export async function runS3BackupNow(): Promise<NonNullable<S3BackupStatus["lastRun"]>> {
  const apiBase = await resolveRequestApiBase();
  const auth = await authHeadersForApi();
  const res = await fetch(`${apiBase}/admin/backup/s3/run`, {
    method: "POST",
    headers: { ...auth },
    cache: "no-store"
  });
  if (!res.ok) await parseBackupError(res, "Falha ao executar backup S3");
  const data = (await res.json()) as { lastRun: NonNullable<S3BackupStatus["lastRun"]> };
  return data.lastRun;
}

export async function listS3BackupObjects(): Promise<{ items: S3BackupObjectItem[] }> {
  const apiBase = await resolveRequestApiBase();
  const auth = await authHeadersForApi();
  const res = await fetch(`${apiBase}/admin/backup/s3/objects`, {
    headers: { ...auth },
    cache: "no-store"
  });
  if (!res.ok) await parseBackupError(res, "Falha ao listar objetos S3");
  return (await res.json()) as { items: S3BackupObjectItem[] };
}

export async function restoreS3Backup(options: {
  objectKey: string;
  confirm: string;
  restoreUploads: boolean;
}): Promise<{
  ok: boolean;
  message: string;
  objectKey: string;
  databaseRestored: boolean;
  uploadsRestored: boolean;
  warnings: string[];
}> {
  const apiBase = await resolveRequestApiBase();
  const auth = await authHeadersForApi();
  const res = await fetch(`${apiBase}/admin/backup/s3/restore`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify(options),
    cache: "no-store"
  });
  if (!res.ok) await parseBackupError(res, "Falha ao restaurar do S3");
  return (await res.json()) as {
    ok: boolean;
    message: string;
    objectKey: string;
    databaseRestored: boolean;
    uploadsRestored: boolean;
    warnings: string[];
  };
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

export type ContractStructureImportResult = Contract & {
  importSummary?: {
    rows: number;
    undefinedGroupCount: number;
    message: string;
  };
};

/** Importa módulos e funcionalidades a partir de arquivo .xlsx (campo file + opcional replace). */
export async function importContractStructureFromXlsx(
  contractId: string,
  file: File,
  replace: boolean
): Promise<ContractStructureImportResult> {
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
  return (await res.json()) as ContractStructureImportResult;
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

export async function deleteProjectTaskAttachment(
  projectId: string,
  taskId: string,
  attachmentId: string
): Promise<{ ok: true }> {
  return request(`/projects/${projectId}/tasks/${taskId}/attachments/${attachmentId}`, { method: "DELETE" });
}

export async function createProjectTaskComment(projectId: string, taskId: string, body: string): Promise<ProjectTaskComment> {
  return request(`/projects/${projectId}/tasks/${taskId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body })
  });
}

// --- Administração (SIGTI) ---

export type OrganizationRecord = {
  id: string;
  name: string;
  acronym: string;
  code?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export async function getOrganizations(): Promise<OrganizationRecord[]> {
  return request("/organizations");
}

export async function createOrganization(payload: {
  name: string;
  acronym: string;
  code?: string | null;
  active?: boolean;
}): Promise<OrganizationRecord> {
  return request("/organizations", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateOrganization(
  id: string,
  payload: { name?: string; acronym?: string; code?: string | null; active?: boolean }
): Promise<OrganizationRecord> {
  return request(`/organizations/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export type PermissionGrant = {
  permissionKey: string;
  granted: boolean;
};

export type AccessProfileRecord = {
  id: string;
  name: string;
  description?: string | null;
  active: boolean;
  systemKey: string | null;
  protected: boolean;
  userCount: number;
  createdAt: string;
  updatedAt: string;
};

export type RolePermissionsPayload = {
  role: "ADMIN" | "EDITOR" | "VIEWER";
  permissions: PermissionGrant[];
};

export type ProfilePermissionsPayload = {
  profileId: string;
  permissions: PermissionGrant[];
};

export type UserPermissionsPayload = {
  userId: string;
  profileId?: string;
  permissions: PermissionGrant[];
  inheritedKeys?: string[];
  effectiveKeys?: string[];
};

type PermissionKeysResponse = {
  role?: "ADMIN" | "EDITOR" | "VIEWER";
  userId?: string;
  profileId?: string;
  keys: string[];
  inheritedKeys?: string[];
  effectiveKeys?: string[];
};

function permissionKeysToGrants(keys: string[]): PermissionGrant[] {
  return keys.map((permissionKey) => ({ permissionKey, granted: true }));
}

export async function getAccessProfiles(includeInactive = true): Promise<AccessProfileRecord[]> {
  const qs = includeInactive ? "?includeInactive=true" : "";
  return request(`/permissions/profiles${qs}`);
}

export async function createAccessProfile(payload: {
  name: string;
  description?: string | null;
}): Promise<AccessProfileRecord> {
  return request("/permissions/profiles", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateAccessProfile(
  id: string,
  payload: { name?: string; description?: string | null; active?: boolean }
): Promise<AccessProfileRecord> {
  return request(`/permissions/profiles/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function deleteAccessProfile(id: string): Promise<{ ok: true }> {
  return request(`/permissions/profiles/${id}`, { method: "DELETE" });
}

export async function getProfilePermissions(profileId: string): Promise<ProfilePermissionsPayload> {
  const response = await request<PermissionKeysResponse>(`/permissions/profile/${profileId}`);
  return { profileId, permissions: permissionKeysToGrants(response.keys) };
}

export async function updateProfilePermissions(
  profileId: string,
  permissions: PermissionGrant[]
): Promise<ProfilePermissionsPayload> {
  const response = await request<PermissionKeysResponse>(`/permissions/profile/${profileId}`, {
    method: "PUT",
    body: JSON.stringify({
      keys: permissions.filter((permission) => permission.granted).map((permission) => permission.permissionKey)
    })
  });
  return { profileId, permissions: permissionKeysToGrants(response.keys) };
}

export async function getRolePermissions(role: "ADMIN" | "EDITOR" | "VIEWER"): Promise<RolePermissionsPayload> {
  const response = await request<PermissionKeysResponse>(`/permissions/role/${role}`);
  return { role, permissions: permissionKeysToGrants(response.keys) };
}

export async function updateRolePermissions(
  role: "ADMIN" | "EDITOR" | "VIEWER",
  permissions: PermissionGrant[]
): Promise<RolePermissionsPayload> {
  const response = await request<PermissionKeysResponse>(`/permissions/role/${role}`, {
    method: "PUT",
    body: JSON.stringify({ keys: permissions.filter((permission) => permission.granted).map((permission) => permission.permissionKey) })
  });
  return { role, permissions: permissionKeysToGrants(response.keys) };
}

export async function getUserPermissions(userId: string, profileId?: string): Promise<UserPermissionsPayload> {
  const qs = profileId ? `?profileId=${encodeURIComponent(profileId)}` : "";
  const response = await request<PermissionKeysResponse>(`/permissions/user/${userId}${qs}`);
  return {
    userId,
    profileId: response.profileId,
    permissions: permissionKeysToGrants(response.keys),
    inheritedKeys: response.inheritedKeys,
    effectiveKeys: response.effectiveKeys
  };
}

export async function updateUserPermissions(
  userId: string,
  permissions: PermissionGrant[],
  profileId?: string
): Promise<UserPermissionsPayload> {
  const response = await request<PermissionKeysResponse>(`/permissions/user/${userId}`, {
    method: "PUT",
    body: JSON.stringify({
      profileId,
      keys: permissions.filter((permission) => permission.granted).map((permission) => permission.permissionKey)
    })
  });
  return { userId, profileId: response.profileId, permissions: permissionKeysToGrants(response.keys) };
}

export type PermissionHistoryEntry = {
  id: string;
  entity: "RolePermission" | "UserPermission" | "AccessProfile";
  entityId: string;
  action: string;
  userId: string;
  timestamp: string;
  oldData?: { keys?: string[] } | null;
  newData?: { keys?: string[] } | null;
};

export async function getRolePermissionHistory(
  role: "ADMIN" | "EDITOR" | "VIEWER"
): Promise<PermissionHistoryEntry[]> {
  return request(`/permissions/role/${role}/history`);
}

export async function getProfilePermissionHistory(profileId: string): Promise<PermissionHistoryEntry[]> {
  return request(`/permissions/profile/${profileId}/history`);
}

export async function getUserPermissionHistory(userId: string): Promise<PermissionHistoryEntry[]> {
  return request(`/permissions/user/${userId}/history`);
}

export type AdminContractItemType = {
  id: string;
  code: string;
  label: string;
  description?: string | null;
  billingKind?: ContractPricingBillingKind | null;
  active: boolean;
  sortOrder: number;
  participatesInGlosa?: boolean;
  useInMeasurements?: boolean;
  useInBalanceControl?: boolean;
  useInConsumption?: boolean;
  useInFinancialPlanning?: boolean;
  infoOnly?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export async function getAdminItemTypes(): Promise<AdminContractItemType[]> {
  return request("/contracts/catalog/item-types");
}

export async function createAdminItemType(payload: {
  code: string;
  label: string;
  description?: string | null;
  active?: boolean;
  sortOrder?: number;
}): Promise<AdminContractItemType> {
  return request("/contracts/catalog/item-types", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateAdminItemType(
  id: string,
  payload: {
    code?: string;
    label?: string;
    description?: string | null;
    active?: boolean;
    sortOrder?: number;
  }
): Promise<AdminContractItemType> {
  return request(`/contracts/catalog/item-types/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export type ContractTypeCatalogRecord = {
  id: string;
  name: string;
  acronym: string;
  description?: string | null;
  active: boolean;
  legacyEnum?: "SOFTWARE" | "DATACENTER" | "INFRA" | "SERVICO" | null;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

export async function getContractTypeCatalog(): Promise<ContractTypeCatalogRecord[]> {
  return request("/contract-type-catalog");
}

export async function createContractTypeCatalogEntry(payload: {
  name: string;
  acronym: string;
  description?: string | null;
  active?: boolean;
  sortOrder?: number;
}): Promise<ContractTypeCatalogRecord> {
  return request("/contract-type-catalog", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateContractTypeCatalogEntry(
  id: string,
  payload: {
    name?: string;
    acronym?: string;
    description?: string | null;
    active?: boolean;
    sortOrder?: number;
  }
): Promise<ContractTypeCatalogRecord> {
  return request(`/contract-type-catalog/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export type HiringTypeRecord = {
  id: string;
  name: string;
  description?: string | null;
  active: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

export async function getHiringTypes(): Promise<HiringTypeRecord[]> {
  return request("/hiring-types");
}

export async function createHiringType(payload: {
  name: string;
  description?: string | null;
  active?: boolean;
  sortOrder?: number;
}): Promise<HiringTypeRecord> {
  return request("/hiring-types", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateHiringType(
  id: string,
  payload: { name?: string; description?: string | null; active?: boolean; sortOrder?: number }
): Promise<HiringTypeRecord> {
  return request(`/hiring-types/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

// —— Notificações contratuais / modelos (tickets 41–46) ——

export type NotificationTemplateRecord = {
  id: string;
  name: string;
  documentTitle: string;
  emailSubject: string;
  purpose: string;
  notificationType: string;
  severity: string;
  defaultResponseDays: number;
  requiresAck: boolean;
  requiresResponse: boolean;
  requiresSchedule: boolean;
  requiresActionPlan: boolean;
  reviewFlow?: string | null;
  active: boolean;
  version: number;
  bodyHtml: string;
  headerHtml?: string | null;
  footerHtml?: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function getNotificationTemplates(includeInactive = false): Promise<NotificationTemplateRecord[]> {
  const q = includeInactive ? "?includeInactive=1" : "";
  return request(`/notification-templates${q}`);
}

export async function getNotificationMailMergeFields(): Promise<string[]> {
  const res = await request<{ fields: string[] }>("/notification-templates/mail-merge-fields");
  return res.fields ?? [];
}

export async function createNotificationTemplate(
  payload: Partial<NotificationTemplateRecord> & {
    name: string;
    documentTitle: string;
    emailSubject: string;
    bodyHtml: string;
  }
): Promise<NotificationTemplateRecord> {
  return request("/notification-templates", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateNotificationTemplate(
  id: string,
  payload: Partial<NotificationTemplateRecord>
): Promise<NotificationTemplateRecord> {
  return request(`/notification-templates/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function deactivateNotificationTemplate(id: string): Promise<NotificationTemplateRecord> {
  return request(`/notification-templates/${id}/deactivate`, { method: "POST", body: "{}" });
}

export type ContractNotificationRecord = {
  id: string;
  contractId: string;
  number: string;
  status: string;
  subject: string;
  bodyHtml: string;
  headerHtml?: string | null;
  footerHtml?: string | null;
  contentLocked?: boolean;
  requiresAck?: boolean;
  requiresResponse?: boolean;
  ackAt?: string | null;
  sentAt?: string | null;
  responseDeadline?: string | null;
  related?: unknown;
  signers?: Array<{
    id: string;
    userId: string;
    order: number;
    required: boolean;
    signedAt?: string | null;
    signerName?: string | null;
    user?: { id: string; email: string; displayName?: string | null };
  }>;
  events?: Array<{
    id: string;
    eventType: string;
    note?: string | null;
    createdAt: string;
    fromStatus?: string | null;
    toStatus?: string | null;
  }>;
  responses?: Array<{
    id: string;
    bodyText: string;
    draft: boolean;
    submittedAt?: string | null;
    analysisStatus?: string | null;
    analysisNote?: string | null;
    itemStatuses?: unknown;
  }>;
  contract?: {
    id: string;
    number: string;
    name: string;
    internalCode?: string | null;
    companyName?: string;
  };
  createdAt: string;
  updatedAt: string;
};

export async function getContractNotifications(contractId: string): Promise<ContractNotificationRecord[]> {
  return request(`/contract-notifications/by-contract/${contractId}`);
}

export async function getMyContractNotifications(): Promise<ContractNotificationRecord[]> {
  return request("/contract-notifications");
}

export async function getContractNotification(id: string): Promise<ContractNotificationRecord> {
  return request(`/contract-notifications/${id}`);
}

export async function createNotificationFromTemplate(payload: {
  contractId: string;
  templateId: string;
  subject?: string;
}): Promise<ContractNotificationRecord> {
  return request("/contract-notifications/from-template", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateNotificationDraft(
  id: string,
  payload: { subject?: string; bodyHtml?: string }
): Promise<ContractNotificationRecord> {
  return request(`/contract-notifications/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function transitionContractNotification(
  id: string,
  payload: { toStatus: string; note?: string }
): Promise<ContractNotificationRecord> {
  return request(`/contract-notifications/${id}/transition`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function setNotificationSigners(
  id: string,
  payload: { signers: Array<{ userId: string; order?: number; required?: boolean }> }
): Promise<ContractNotificationRecord> {
  return request(`/contract-notifications/${id}/signers`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function signContractNotification(
  id: string,
  payload: { password: string }
): Promise<ContractNotificationRecord> {
  return request(`/contract-notifications/${id}/sign`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function prepareAndSendNotification(
  id: string,
  payload?: { extraEmails?: string[] }
): Promise<{ ok: boolean; send?: { errorSummary?: string; channel?: string }; notification?: ContractNotificationRecord }> {
  const auth = await authHeadersForApi();
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/notifications/send`
      : `${(await resolveRequestApiBase()).replace(/\/api\/?$/, "")}/api/notifications/send`;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ notificationId: id, extraEmails: payload?.extraEmails ?? [] }),
    cache: "no-store"
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message || "Falha ao enviar notificação");
  }
  return (await res.json()) as {
    ok: boolean;
    send?: { errorSummary?: string; channel?: string };
    notification?: ContractNotificationRecord;
  };
}

export async function acknowledgeContractNotification(id: string): Promise<ContractNotificationRecord> {
  return request(`/contract-notifications/${id}/acknowledge`, { method: "POST", body: "{}" });
}

export async function saveNotificationResponse(
  id: string,
  payload: { bodyText: string; itemStatuses?: unknown; submit?: boolean }
): Promise<{ response: unknown; notification: ContractNotificationRecord }> {
  return request(`/contract-notifications/${id}/response`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function analyzeNotificationResponse(
  notificationId: string,
  responseId: string,
  payload: { analysisStatus: string; analysisNote: string }
): Promise<ContractNotificationRecord> {
  return request(`/contract-notifications/${notificationId}/responses/${responseId}/analyze`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function cancelContractNotification(
  id: string,
  payload: { reason: string }
): Promise<ContractNotificationRecord> {
  return request(`/contract-notifications/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}
