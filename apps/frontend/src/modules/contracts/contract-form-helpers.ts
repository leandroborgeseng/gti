import type { Contract } from "@/lib/api";
import {
  CONTRACT_FORM_DEFAULT_VALUES,
  formalNumberFromContract,
  onlyDigitsCnpj,
  type ContractPageFormInput
} from "@/modules/contracts/contract-form-schema";
import { isContractLifecycleStatus } from "@/modules/contracts/contract-status";

export type CatalogOption = {
  id: string;
  name: string;
  acronym?: string;
  active?: boolean;
  legacyEnum?: string | null;
  sortOrder?: number;
};

export type RegularizationPending = {
  field: keyof ContractPageFormInput | "pricingItems";
  label: string;
  message: string;
  /** Âncora HTML no formulário (id do campo). */
  anchorId: string;
};

function safeDateInput(value: string | null | undefined): string {
  if (!value) return "";
  const raw = String(value).trim();
  if (raw.length < 10) return "";
  const slice = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(slice)) return "";
  return slice;
}

function normalizeContractType(raw: string | null | undefined): ContractPageFormInput["contractType"] {
  if (raw === "SOFTWARE" || raw === "DATACENTER" || raw === "INFRA" || raw === "SERVICO") {
    return raw;
  }
  return "SOFTWARE";
}

/** Converte contrato (completo ou parcial/legado) em defaults do formulário sem lançar. */
export function contractToFormDefaults(c: Contract | null | undefined): ContractPageFormInput {
  if (!c) return { ...CONTRACT_FORM_DEFAULT_VALUES };
  try {
    const cnpjDigits = onlyDigitsCnpj(c.cnpj ?? c.supplier?.cnpj ?? "");
    const lt = (c.lawType ?? "") as ContractPageFormInput["lawType"];
    return {
      ...CONTRACT_FORM_DEFAULT_VALUES,
      formalNumber: formalNumberFromContract(c),
      number: c.number ?? "",
      administrativeProcess: c.administrativeProcess ?? "",
      organizationId: c.organizationId ?? "",
      contractTypeCatalogId: c.contractTypeCatalogId ?? "",
      contractType: normalizeContractType(c.contractType),
      hiringTypeId: c.hiringTypeId ?? "",
      hiringProcedureNumber: c.hiringProcedureNumber ?? "",
      name: c.name ?? "",
      description: c.description ?? "",
      managingUnit: c.managingUnit ?? "",
      companyName: c.companyName ?? "",
      cnpj: cnpjDigits,
      lawType: lt === "LEI_8666" || lt === "LEI_14133" ? lt : "",
      status: isContractLifecycleStatus(c.status) ? c.status : "ACTIVE",
      startDate: safeDateInput(c.startDate),
      endDate: safeDateInput(c.endDate),
      monthlyValue: "",
      installationValue: "",
      globalValueManual: Boolean(c.globalValueManual),
      globalValueCurrent: c.globalValueManual ? String(c.globalValueCurrent ?? "") : "",
      globalValueJustification: c.globalValueManual ? c.globalValueJustification ?? "" : "",
      implementationPeriodStart: safeDateInput(c.implementationPeriodStart),
      implementationPeriodEnd: safeDateInput(c.implementationPeriodEnd),
      fiscalId: c.fiscal?.id ?? "",
      managerId: c.manager?.id ?? "",
      supplierId: c.supplier?.id ?? "",
      glpiGroups: Array.isArray(c.glpiGroups)
        ? c.glpiGroups
            .filter((g) => g && typeof g.glpiGroupId === "number" && Number.isFinite(g.glpiGroupId))
            .map((g) => ({
              glpiGroupId: g.glpiGroupId,
              glpiGroupName: g.glpiGroupName ?? undefined
            }))
        : []
    };
  } catch {
    return { ...CONTRACT_FORM_DEFAULT_VALUES };
  }
}

/** Mescla opções ativas com vínculo inativo/órfão do contrato (nunca remove o valor ligado). */
export function mergeCatalogOptionsWithLink<T extends CatalogOption>(
  all: T[] | null | undefined,
  linkedId: string | null | undefined,
  linked: Partial<T> | null | undefined,
  fallbackName: string
): T[] {
  const list = Array.isArray(all) ? all.filter((o) => o?.id) : [];
  const active = list
    .filter((o) => o.active !== false)
    .slice()
    .sort((a, b) => {
      const so = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      if (so !== 0) return so;
      return (a.name ?? "").localeCompare(b.name ?? "", "pt-BR");
    });
  const id = (linkedId ?? "").trim();
  if (!id) return active;
  if (active.some((o) => o.id === id)) return active;
  const fromAll = list.find((o) => o.id === id);
  const base = (fromAll ?? linked ?? { id, name: fallbackName }) as T;
  return [
    {
      ...base,
      id,
      name: base.name?.trim() || fallbackName,
      active: false
    } as T,
    ...active
  ];
}

/** Valor seguro para Radix Select: undefined se vazio ou sem opção correspondente. */
export function safeSelectValue(
  value: string | null | undefined,
  optionIds: Iterable<string>
): string | undefined {
  const v = (value ?? "").trim();
  if (!v) return undefined;
  const set = optionIds instanceof Set ? optionIds : new Set(optionIds);
  return set.has(v) ? v : undefined;
}

export function collectRegularizationPendings(
  values: ContractPageFormInput,
  opts: {
    organizationOptions: CatalogOption[];
    contractTypeOptions: CatalogOption[];
    hiringTypeOptions: CatalogOption[];
    fiscalIds: Set<string>;
    managingUnitLegacy?: string | null;
    contractTypeLegacy?: string | null;
  }
): RegularizationPending[] {
  const out: RegularizationPending[] = [];
  const orgId = (values.organizationId ?? "").trim();
  if (!orgId) {
    out.push({
      field: "organizationId",
      label: "Órgão gestor",
      message: opts.managingUnitLegacy?.trim()
        ? `Sem vínculo no cadastro central. Texto legado: «${opts.managingUnitLegacy.trim()}».`
        : "Contrato sem órgão gestor vinculado.",
      anchorId: "field-organizationId"
    });
  } else {
    const opt = opts.organizationOptions.find((o) => o.id === orgId);
    if (!opt) {
      out.push({
        field: "organizationId",
        label: "Órgão gestor",
        message: "O órgão vinculado não está na lista atual. Selecione um órgão ativo.",
        anchorId: "field-organizationId"
      });
    } else if (opt.active === false) {
      out.push({
        field: "organizationId",
        label: "Órgão gestor",
        message: "O órgão vinculado está inativo. Substitua por um órgão ativo.",
        anchorId: "field-organizationId"
      });
    }
  }

  const typeId = (values.contractTypeCatalogId ?? "").trim();
  if (!typeId) {
    out.push({
      field: "contractTypeCatalogId",
      label: "Tipo de contrato",
      message: opts.contractTypeLegacy
        ? `Sem tipo no catálogo. Classificação legada: «${opts.contractTypeLegacy}».`
        : "Contrato sem tipo de contrato vinculado.",
      anchorId: "field-contractTypeCatalogId"
    });
  } else {
    const opt = opts.contractTypeOptions.find((o) => o.id === typeId);
    if (!opt) {
      out.push({
        field: "contractTypeCatalogId",
        label: "Tipo de contrato",
        message: "O tipo vinculado não está na lista atual. Selecione um tipo ativo.",
        anchorId: "field-contractTypeCatalogId"
      });
    } else if (opt.active === false) {
      out.push({
        field: "contractTypeCatalogId",
        label: "Tipo de contrato",
        message: "O tipo de contrato vinculado está inativo. Substitua por um tipo ativo.",
        anchorId: "field-contractTypeCatalogId"
      });
    }
  }

  const hiringId = (values.hiringTypeId ?? "").trim();
  if (hiringId) {
    const opt = opts.hiringTypeOptions.find((o) => o.id === hiringId);
    if (!opt) {
      out.push({
        field: "hiringTypeId",
        label: "Tipo de contratação",
        message: "A modalidade vinculada não está na lista atual. Selecione outra ou limpe o campo.",
        anchorId: "field-hiringTypeId"
      });
    } else if (opt.active === false) {
      out.push({
        field: "hiringTypeId",
        label: "Tipo de contratação",
        message: "A modalidade vinculada está inativa. Substitua por uma opção ativa.",
        anchorId: "field-hiringTypeId"
      });
    }
  }

  if (!(values.formalNumber ?? "").trim()) {
    out.push({
      field: "formalNumber",
      label: "Número formal",
      message: "Número formal do instrumento não preenchido.",
      anchorId: "field-formalNumber"
    });
  }

  const fiscalId = (values.fiscalId ?? "").trim();
  if (!fiscalId) {
    out.push({
      field: "fiscalId",
      label: "Fiscal",
      message: "Fiscal não definido.",
      anchorId: "field-fiscalId"
    });
  } else if (opts.fiscalIds.size > 0 && !opts.fiscalIds.has(fiscalId)) {
    out.push({
      field: "fiscalId",
      label: "Fiscal",
      message: "O fiscal vinculado não está na lista atual. Selecione outro cadastro.",
      anchorId: "field-fiscalId"
    });
  }

  if (!values.startDate || !values.endDate) {
    out.push({
      field: "startDate",
      label: "Vigência",
      message: "Datas de vigência incompletas.",
      anchorId: "field-startDate"
    });
  }

  return out;
}
