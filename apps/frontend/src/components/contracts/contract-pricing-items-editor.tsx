"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Copy, Pencil, Plus, Trash2, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  createContractItemType,
  createMeasureUnit,
  getContractPricingCatalog,
  type ConsumptionAvailabilityPeriod,
  type ConsumptionFinancialRule,
  type ContractPricingBillingKind,
  type ContractPricingItem,
  type ContractPricingItemInput,
  type ContractPricingItemStatus,
  type ContractPricingPeriodicity,
  type ContractPricingTotals
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type PricingDraftItem = {
  /** Chave local estável (antes do id persistido). */
  key: string;
  id?: string;
  sequence: number;
  typeId: string;
  description: string;
  unitId: string;
  quantity: string;
  unitValue: string;
  totalValue: string;
  totalManual: boolean;
  totalJustification: string;
  billingKind: ContractPricingBillingKind;
  periodicity: ContractPricingPeriodicity | "";
  periodStart: string;
  periodEnd: string;
  status: ContractPricingItemStatus;
  includeInGlosaBase: boolean;
  consumedQuantity?: string;
  consumptionEnabled: boolean;
  consumptionFinancialRule: ConsumptionFinancialRule | "";
  consumptionAvailability: ConsumptionAvailabilityPeriod | "";
  consumptionAccumulates: boolean;
  consumptionRequiresValidation: boolean;
};

type Props = {
  value: PricingDraftItem[];
  onChange: (next: PricingDraftItem[]) => void;
  /** Quando true, impede exclusão definitiva — só cancelamento. */
  lockHardDelete?: boolean;
  error?: string | null;
};

const BILLING_LABELS: Record<ContractPricingBillingKind, string> = {
  RECURRING: "Recorrente",
  ONE_TIME: "Valor único",
  ON_DEMAND: "Sob demanda"
};

const PERIODICITY_LABELS: Record<ContractPricingPeriodicity, string> = {
  MONTHLY: "Mensal",
  BIMONTHLY: "Bimestral",
  QUARTERLY: "Trimestral",
  SEMIANNUAL: "Semestral",
  ANNUAL: "Anual",
  CUSTOM: "Outra"
};

const FINANCIAL_RULE_LABELS: Record<ConsumptionFinancialRule, string> = {
  INCLUDED_IN_MONTHLY: "Incluído na mensalidade",
  BILLED_BY_CONSUMPTION: "Faturado conforme consumo",
  CONTRACTED_BY_QUANTITY: "Valor contratado por quantidade",
  BALANCE_ONLY: "Somente controle de saldo"
};

const AVAILABILITY_LABELS: Record<ConsumptionAvailabilityPeriod, string> = {
  MONTHLY: "Mensal",
  ANNUAL: "Anual",
  CONTRACT_TERM: "Toda a vigência",
  SPECIFIC_PERIOD: "Período específico",
  AMENDMENT: "Conforme aditivos"
};

const FINANCIAL_RULES = new Set<ConsumptionFinancialRule>([
  "INCLUDED_IN_MONTHLY",
  "BILLED_BY_CONSUMPTION",
  "CONTRACTED_BY_QUANTITY",
  "BALANCE_ONLY"
]);
const AVAILABILITIES = new Set<ConsumptionAvailabilityPeriod>([
  "MONTHLY",
  "ANNUAL",
  "CONTRACT_TERM",
  "SPECIFIC_PERIOD",
  "AMENDMENT"
]);

function parseMoney(s: string): number {
  const n = Number(String(s).trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

function formatMoneyInput(n: number): string {
  if (!Number.isFinite(n)) return "";
  return String(Math.round(n * 100) / 100).replace(".", ",");
}

function formatBrl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function newKey(): string {
  return `local_${Math.random().toString(36).slice(2, 10)}`;
}

const BILLING_KINDS = new Set<ContractPricingBillingKind>(["RECURRING", "ONE_TIME", "ON_DEMAND"]);
const PERIODICITIES = new Set<ContractPricingPeriodicity>([
  "MONTHLY",
  "BIMONTHLY",
  "QUARTERLY",
  "SEMIANNUAL",
  "ANNUAL",
  "CUSTOM"
]);
const ITEM_STATUSES = new Set<ContractPricingItemStatus>(["ACTIVE", "CANCELLED"]);

export function pricingItemsFromContract(items: ContractPricingItem[] | undefined): PricingDraftItem[] {
  if (!items?.length) return [];
  try {
    return items.map((it, idx) => {
      const billingKind = BILLING_KINDS.has(it.billingKind as ContractPricingBillingKind)
        ? (it.billingKind as ContractPricingBillingKind)
        : "RECURRING";
      const periodicityRaw = (it.periodicity ?? "") as ContractPricingPeriodicity | "";
      const periodicity =
        periodicityRaw && PERIODICITIES.has(periodicityRaw as ContractPricingPeriodicity)
          ? (periodicityRaw as ContractPricingPeriodicity)
          : billingKind === "RECURRING"
            ? "MONTHLY"
            : "";
      const status = ITEM_STATUSES.has(it.status as ContractPricingItemStatus)
        ? (it.status as ContractPricingItemStatus)
        : "ACTIVE";
      return {
        key: it.id || `legacy_${idx}_${newKey()}`,
        id: it.id,
        sequence: Number.isFinite(Number(it.sequence)) ? Number(it.sequence) : idx + 1,
        typeId: it.typeId ?? "",
        description: it.description ?? "",
        unitId: it.unitId ?? "",
        quantity: formatMoneyInput(Number(it.quantity)),
        unitValue: formatMoneyInput(Number(it.unitValue)),
        totalValue: formatMoneyInput(Number(it.totalValue)),
        totalManual: Boolean(it.totalManual),
        totalJustification: it.totalJustification ?? "",
        billingKind,
        periodicity,
        periodStart: it.periodStart ? String(it.periodStart).slice(0, 10) : "",
        periodEnd: it.periodEnd ? String(it.periodEnd).slice(0, 10) : "",
        status,
        includeInGlosaBase: Boolean(it.includeInGlosaBase),
        consumedQuantity: it.consumedQuantity,
        consumptionEnabled:
          it.consumptionEnabled != null
            ? Boolean(it.consumptionEnabled)
            : billingKind === "ON_DEMAND",
        consumptionFinancialRule:
          it.consumptionFinancialRule && FINANCIAL_RULES.has(it.consumptionFinancialRule)
            ? it.consumptionFinancialRule
            : billingKind === "ON_DEMAND"
              ? "BILLED_BY_CONSUMPTION"
              : "",
        consumptionAvailability:
          it.consumptionAvailability && AVAILABILITIES.has(it.consumptionAvailability)
            ? it.consumptionAvailability
            : "",
        consumptionAccumulates: Boolean(it.consumptionAccumulates),
        consumptionRequiresValidation: Boolean(it.consumptionRequiresValidation)
      };
    });
  } catch {
    return [];
  }
}

export function emptyPricingItem(sequence: number, defaults?: Partial<PricingDraftItem>): PricingDraftItem {
  const restDefaults = { ...(defaults ?? {}) };
  delete restDefaults.key;
  delete restDefaults.sequence;
  return {
    key: newKey(),
    sequence,
    typeId: "",
    description: "",
    unitId: "",
    quantity: "1",
    unitValue: "",
    totalValue: "",
    totalManual: false,
    totalJustification: "",
    billingKind: "RECURRING",
    periodicity: "MONTHLY",
    periodStart: "",
    periodEnd: "",
    status: "ACTIVE",
    includeInGlosaBase: false,
    consumptionEnabled: false,
    consumptionFinancialRule: "",
    consumptionAvailability: "",
    consumptionAccumulates: false,
    consumptionRequiresValidation: false,
    ...restDefaults
  };
}

export function summarizePricingDraft(items: PricingDraftItem[]): ContractPricingTotals {
  let recurringPredicted = 0;
  let oneTime = 0;
  let onDemand = 0;
  let monthlyValue = 0;
  let installationValue = 0;

  for (const item of items) {
    if (item.status !== "ACTIVE") continue;
    const qty = parseMoney(item.quantity);
    const unit = parseMoney(item.unitValue);
    const expected = Math.round(qty * unit * 100) / 100;
    const total = item.totalManual ? parseMoney(item.totalValue) : expected;
    if (!Number.isFinite(total)) continue;

    if (item.billingKind === "RECURRING") {
      recurringPredicted += total;
      const uv = Number.isFinite(unit) ? unit : 0;
      switch (item.periodicity) {
        case "BIMONTHLY":
          monthlyValue += uv / 2;
          break;
        case "QUARTERLY":
          monthlyValue += uv / 3;
          break;
        case "SEMIANNUAL":
          monthlyValue += uv / 6;
          break;
        case "ANNUAL":
          monthlyValue += uv / 12;
          break;
        default:
          monthlyValue += uv;
      }
    } else if (item.billingKind === "ONE_TIME") {
      oneTime += total;
      installationValue += total;
    } else {
      onDemand += total;
    }
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    recurringPredicted: round2(recurringPredicted),
    oneTime: round2(oneTime),
    onDemand: round2(onDemand),
    globalEstimated: round2(recurringPredicted + oneTime + onDemand),
    monthlyValue: round2(Math.max(monthlyValue, 0)),
    installationValue: installationValue > 0 ? round2(installationValue) : null
  };
}

export function toPricingItemInputs(items: PricingDraftItem[]): ContractPricingItemInput[] {
  return items.map((item, idx) => {
    const quantity = parseMoney(item.quantity);
    const unitValue = parseMoney(item.unitValue);
    const expected = Math.round(quantity * unitValue * 100) / 100;
    const totalValue = item.totalManual ? parseMoney(item.totalValue) : expected;
    return {
      id: item.id,
      sequence: item.sequence || idx + 1,
      typeId: item.typeId,
      description: item.description.trim(),
      unitId: item.unitId,
      quantity,
      unitValue,
      totalValue,
      totalManual: item.totalManual,
      totalJustification: item.totalManual ? item.totalJustification.trim() || null : null,
      billingKind: item.billingKind,
      periodicity: item.billingKind === "RECURRING" ? item.periodicity || "MONTHLY" : null,
      periodStart: item.periodStart.trim() || null,
      periodEnd: item.periodEnd.trim() || null,
      status: item.status,
      includeInGlosaBase: item.includeInGlosaBase,
      consumptionEnabled: item.consumptionEnabled || item.billingKind === "ON_DEMAND",
      consumptionFinancialRule: item.consumptionEnabled || item.billingKind === "ON_DEMAND"
        ? item.consumptionFinancialRule ||
          (item.billingKind === "ON_DEMAND" ? "BILLED_BY_CONSUMPTION" : "BALANCE_ONLY")
        : null,
      consumptionAvailability: item.consumptionEnabled || item.billingKind === "ON_DEMAND"
        ? item.consumptionAvailability || "CONTRACT_TERM"
        : null,
      consumptionAccumulates: item.consumptionAccumulates,
      consumptionRequiresValidation: item.consumptionRequiresValidation
    };
  });
}

export function validatePricingDraft(items: PricingDraftItem[]): string | null {
  const active = items.filter((i) => i.status === "ACTIVE");
  if (active.length === 0) return "Inclua ao menos um item contratual ativo.";
  for (const item of items) {
    if (item.status === "CANCELLED") continue;
    if (!item.typeId) return `Item ${item.sequence}: selecione o tipo padronizado.`;
    if (!item.description.trim()) return `Item ${item.sequence}: informe a descrição contratual.`;
    if (!item.unitId) return `Item ${item.sequence}: selecione a unidade de medida.`;
    const qty = parseMoney(item.quantity);
    const uv = parseMoney(item.unitValue);
    if (!Number.isFinite(qty) || qty < 0) return `Item ${item.sequence}: quantidade inválida.`;
    if (!Number.isFinite(uv) || uv < 0) return `Item ${item.sequence}: valor unitário inválido.`;
    if (item.billingKind === "RECURRING" && !item.periodicity) {
      return `Item ${item.sequence}: informe a periodicidade.`;
    }
    if (item.totalManual) {
      const total = parseMoney(item.totalValue);
      if (!Number.isFinite(total) || total < 0) return `Item ${item.sequence}: valor total inválido.`;
      const expected = Math.round(qty * uv * 100) / 100;
      if (Math.abs(total - expected) > 0.009 && !item.totalJustification.trim()) {
        return `Item ${item.sequence}: informe a justificativa da divergência no valor total.`;
      }
    }
  }
  return null;
}

export function ContractPricingItemsEditor({ value, onChange, lockHardDelete, error }: Props): JSX.Element {
  const qc = useQueryClient();
  const qCatalog = useQuery({
    queryKey: queryKeys.contractPricingCatalog,
    queryFn: getContractPricingCatalog,
    staleTime: 10 * 60_000,
    retry: 1,
    throwOnError: false
  });
  const types = Array.isArray(qCatalog.data?.types) ? qCatalog.data.types : [];
  const units = Array.isArray(qCatalog.data?.units) ? qCatalog.data.units : [];
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [newUnitLabel, setNewUnitLabel] = useState("");
  const [newTypeLabel, setNewTypeLabel] = useState("");

  const totals = useMemo(() => summarizePricingDraft(value), [value]);

  const createUnitMut = useMutation({
    mutationFn: createMeasureUnit,
    onSuccess: (u) => {
      void qc.invalidateQueries({ queryKey: queryKeys.contractPricingCatalog });
      toast.success(`Unidade «${u.label}» adicionada.`);
      setNewUnitLabel("");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro ao criar unidade")
  });

  const createTypeMut = useMutation({
    mutationFn: createContractItemType,
    onSuccess: (t) => {
      void qc.invalidateQueries({ queryKey: queryKeys.contractPricingCatalog });
      toast.success(`Tipo «${t.label}» adicionado.`);
      setNewTypeLabel("");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro ao criar tipo")
  });

  function updateItem(key: string, patch: Partial<PricingDraftItem>): void {
    onChange(
      value.map((item) => {
        if (item.key !== key) return item;
        const next = { ...item, ...patch };
        if (!next.totalManual && ("quantity" in patch || "unitValue" in patch)) {
          const qty = parseMoney(next.quantity);
          const uv = parseMoney(next.unitValue);
          if (Number.isFinite(qty) && Number.isFinite(uv)) {
            next.totalValue = formatMoneyInput(qty * uv);
          }
        }
        if (patch.billingKind === "ONE_TIME" || patch.billingKind === "ON_DEMAND") {
          next.periodicity = "";
          next.includeInGlosaBase = false;
        }
        if (patch.billingKind === "RECURRING" && !next.periodicity) {
          next.periodicity = "MONTHLY";
        }
        return next;
      })
    );
  }

  function renumber(list: PricingDraftItem[]): PricingDraftItem[] {
    return list.map((item, idx) => ({ ...item, sequence: idx + 1 }));
  }

  function addItem(): void {
    const draft = emptyPricingItem(value.length + 1, {
      typeId: types.find((t) => t.code === "MENSALIDADE")?.id ?? types[0]?.id ?? "",
      unitId: units.find((u) => u.code === "MES")?.id ?? units[0]?.id ?? ""
    });
    onChange([...value, draft]);
    setOpenKey(draft.key);
  }

  function duplicateItem(key: string): void {
    const src = value.find((i) => i.key === key);
    if (!src) return;
    const copy: PricingDraftItem = {
      ...src,
      key: newKey(),
      id: undefined,
      sequence: value.length + 1,
      status: "ACTIVE",
      description: `${src.description} (cópia)`.trim()
    };
    onChange([...value, copy]);
    setOpenKey(copy.key);
  }

  function moveItem(key: string, dir: -1 | 1): void {
    const idx = value.findIndex((i) => i.key === key);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= value.length) return;
    const next = [...value];
    const [row] = next.splice(idx, 1);
    next.splice(target, 0, row);
    onChange(renumber(next));
  }

  function removeOrCancel(key: string): void {
    const item = value.find((i) => i.key === key);
    if (!item) return;
    if (lockHardDelete && item.id) {
      updateItem(key, { status: "CANCELLED" });
      toast.message("Item cancelado. O histórico financeiro é preservado.");
      return;
    }
    onChange(renumber(value.filter((i) => i.key !== key)));
    if (openKey === key) setOpenKey(null);
  }

  function typeLabel(typeId: string): string {
    return types.find((t) => t.id === typeId)?.label ?? "-";
  }

  function unitLabel(unitId: string): string {
    return units.find((u) => u.id === unitId)?.label ?? "-";
  }

  return (
    <div className="sm:col-span-2 space-y-3">
      {qCatalog.isPending ? <p className="text-sm text-muted-foreground">Carregando catálogo de tipos e unidades…</p> : null}
      {qCatalog.error ? (
        <p className="text-sm text-destructive">
          {qCatalog.error instanceof Error ? qCatalog.error.message : "Falha ao carregar catálogo."}
        </p>
      ) : null}

      {value.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 bg-slate-50/80 px-3 py-4 text-sm text-slate-600">
          Nenhum item contratual. Adicione mensalidade, implantação, horas, UST, equipamentos ou outros itens precificados.
        </p>
      ) : (
        <ul className="space-y-2">
          {value.map((item) => {
            const open = openKey === item.key;
            const qty = parseMoney(item.quantity);
            const uv = parseMoney(item.unitValue);
            const expected = Number.isFinite(qty) && Number.isFinite(uv) ? Math.round(qty * uv * 100) / 100 : NaN;
            const total = item.totalManual ? parseMoney(item.totalValue) : expected;
            const cancelled = item.status === "CANCELLED";
            const isMensalidade = types.find((type) => type.id === item.typeId)?.code === "MENSALIDADE";
            const canBeGlosaBase = item.billingKind === "RECURRING" || isMensalidade;
            return (
              <li
                key={item.key}
                className={`rounded-lg border ${cancelled ? "border-slate-200 bg-slate-50 opacity-80" : "border-slate-200 bg-white"}`}
              >
                <div className="flex flex-wrap items-start gap-2 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Item {item.sequence}
                      {cancelled ? " · Cancelado" : ""} ·{" "}
                      {BILLING_LABELS[item.billingKind] ?? item.billingKind ?? "—"}
                      {item.billingKind === "RECURRING" && item.periodicity
                        ? ` · ${PERIODICITY_LABELS[item.periodicity] ?? item.periodicity}`
                        : ""}
                    </p>
                    <p className="mt-0.5 text-sm font-medium text-slate-900">{typeLabel(item.typeId)}</p>
                    <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">
                      {item.description.trim() || "Sem descrição contratual"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {Number.isFinite(qty) ? qty : "-"} {unitLabel(item.unitId).toLowerCase()} ×{" "}
                      {Number.isFinite(uv) ? formatBrl(uv) : "-"} ={" "}
                      <span className="font-medium text-slate-800">
                        {Number.isFinite(total) ? formatBrl(total) : "-"}
                      </span>
                      {item.billingKind === "ON_DEMAND" && item.consumedQuantity != null ? (
                        <span>
                          {" "}
                          · Consumido: {Number(item.consumedQuantity).toLocaleString("pt-BR")}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button type="button" size="sm" variant="outline" onClick={() => setOpenKey(open ? null : item.key)}>
                      {open ? <ChevronUp className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                      <span className="ml-1">{open ? "Fechar" : "Editar"}</span>
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => moveItem(item.key, -1)} title="Subir">
                      <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => moveItem(item.key, 1)} title="Descer">
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => duplicateItem(item.key)} title="Duplicar">
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => removeOrCancel(item.key)}
                      title={lockHardDelete && item.id ? "Cancelar item" : "Excluir"}
                    >
                      {lockHardDelete && item.id ? (
                        <XCircle className="h-3.5 w-3.5 text-amber-700" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      )}
                    </Button>
                  </div>
                </div>

                {open ? (
                  <div className="grid gap-3 border-t border-slate-100 px-3 py-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Tipo padronizado</span>
                      <Select
                        value={item.typeId.trim() || undefined}
                        onValueChange={(v) => updateItem(item.key, { typeId: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {item.typeId && !types.some((t) => t.id === item.typeId) ? (
                            <SelectItem value={item.typeId}>Tipo vinculado (indisponível) (Inativo)</SelectItem>
                          ) : null}
                          {types
                            .filter((t) => t.id && (t.active || t.id === item.typeId))
                            .map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.label}
                                {!t.active ? " (Inativo)" : ""}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      {types.length === 0 && !qCatalog.isPending ? (
                        <p className="mt-1 text-xs text-amber-800">Nenhum tipo de item ativo foi cadastrado.</p>
                      ) : null}
                      {qCatalog.isError ? (
                        <p className="mt-1 text-xs text-amber-800">
                          Não foi possível carregar os tipos de item.{" "}
                          <button
                            type="button"
                            className="underline"
                            onClick={() => void qc.invalidateQueries({ queryKey: queryKeys.contractPricingCatalog })}
                          >
                            Tentar novamente
                          </button>
                        </p>
                      ) : null}
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Unidade de medida</span>
                      <Select
                        value={item.unitId.trim() || undefined}
                        onValueChange={(v) => updateItem(item.key, { unitId: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {item.unitId && !units.some((u) => u.id === item.unitId) ? (
                            <SelectItem value={item.unitId}>Unidade vinculada (indisponível) (Inativo)</SelectItem>
                          ) : null}
                          {units
                            .filter((u) => u.id && (u.active || u.id === item.unitId))
                            .map((u) => (
                              <SelectItem key={u.id} value={u.id}>
                                {u.label}
                                {!u.active ? " (Inativo)" : ""}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </label>
                    <label className="block text-sm sm:col-span-2">
                      <span className="mb-1 block font-medium text-slate-700">Descrição contratual</span>
                      <Textarea
                        rows={3}
                        value={item.description}
                        onChange={(e) => updateItem(item.key, { description: e.target.value })}
                        placeholder="Redação integral do contrato, edital, proposta ou termo de referência"
                        className="min-h-[72px] resize-y"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Quantidade contratada</span>
                      <Input
                        inputMode="decimal"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.key, { quantity: e.target.value })}
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Valor unitário (R$)</span>
                      <Input
                        inputMode="decimal"
                        value={item.unitValue}
                        onChange={(e) => updateItem(item.key, { unitValue: e.target.value })}
                        placeholder="0,00"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Valor total (R$)</span>
                      <Input
                        inputMode="decimal"
                        value={
                          item.totalManual
                            ? item.totalValue
                            : Number.isFinite(expected)
                              ? formatMoneyInput(expected)
                              : ""
                        }
                        disabled={!item.totalManual}
                        onChange={(e) => updateItem(item.key, { totalValue: e.target.value })}
                      />
                    </label>
                    <label className="flex items-end gap-2 pb-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={item.totalManual}
                        onChange={(e) =>
                          updateItem(item.key, {
                            totalManual: e.target.checked,
                            totalValue: e.target.checked
                              ? item.totalValue || (Number.isFinite(expected) ? formatMoneyInput(expected) : "")
                              : Number.isFinite(expected)
                                ? formatMoneyInput(expected)
                                : ""
                          })
                        }
                      />
                      <span className="text-slate-700">Informar valor total manualmente</span>
                    </label>
                    {item.totalManual ? (
                      <label className="block text-sm sm:col-span-2">
                        <span className="mb-1 block font-medium text-slate-700">Justificativa da divergência</span>
                        <Textarea
                          rows={2}
                          value={item.totalJustification}
                          onChange={(e) => updateItem(item.key, { totalJustification: e.target.value })}
                          placeholder="Obrigatória quando o total não for quantidade × valor unitário"
                        />
                      </label>
                    ) : null}
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Forma de cobrança</span>
                      <Select
                        value={item.billingKind}
                        onValueChange={(v) => updateItem(item.key, { billingKind: v as ContractPricingBillingKind })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(BILLING_LABELS) as ContractPricingBillingKind[]).map((k) => (
                            <SelectItem key={k} value={k}>
                              {BILLING_LABELS[k]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                    {item.billingKind === "RECURRING" ? (
                      <label className="block text-sm">
                        <span className="mb-1 block font-medium text-slate-700">Periodicidade</span>
                        <Select
                          value={item.periodicity || "MONTHLY"}
                          onValueChange={(v) =>
                            updateItem(item.key, { periodicity: v as ContractPricingPeriodicity })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(PERIODICITY_LABELS) as ContractPricingPeriodicity[]).map((k) => (
                              <SelectItem key={k} value={k}>
                                {PERIODICITY_LABELS[k]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </label>
                    ) : (
                      <p className="self-end pb-2 text-xs text-slate-500">
                        {item.billingKind === "ON_DEMAND"
                          ? "Sob demanda: quantidade contratada e valor total do teto; o consumo é controlado depois."
                          : "Valor único: sem periodicidade (ex.: implantação, equipamento, treinamento fechado)."}
                      </p>
                    )}
                    {canBeGlosaBase ? (
                      <label className="flex items-end gap-2 pb-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={item.includeInGlosaBase}
                          onChange={(e) => updateItem(item.key, { includeInGlosaBase: e.target.checked })}
                        />
                        <span className="text-slate-700">Base de glosa</span>
                      </label>
                    ) : null}
                    <div className="sm:col-span-2 rounded-md border border-slate-200 bg-slate-50/80 p-3 space-y-3">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={item.consumptionEnabled || item.billingKind === "ON_DEMAND"}
                          onChange={(e) =>
                            updateItem(item.key, {
                              consumptionEnabled: e.target.checked,
                              consumptionFinancialRule: e.target.checked
                                ? item.consumptionFinancialRule ||
                                  (item.billingKind === "ON_DEMAND"
                                    ? "BILLED_BY_CONSUMPTION"
                                    : "BALANCE_ONLY")
                                : "",
                              consumptionAvailability: e.target.checked
                                ? item.consumptionAvailability || "CONTRACT_TERM"
                                : ""
                            })
                          }
                          disabled={item.billingKind === "ON_DEMAND"}
                        />
                        <span className="font-medium text-slate-800">
                          Controlar consumo (horas, UST, visitas, etc.)
                        </span>
                      </label>
                      {(item.consumptionEnabled || item.billingKind === "ON_DEMAND") && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block text-sm">
                            <span className="mb-1 block font-medium text-slate-700">
                              Regra financeira do consumo
                            </span>
                            <Select
                              value={
                                item.consumptionFinancialRule ||
                                (item.billingKind === "ON_DEMAND"
                                  ? "BILLED_BY_CONSUMPTION"
                                  : "BALANCE_ONLY")
                              }
                              onValueChange={(v) =>
                                updateItem(item.key, {
                                  consumptionFinancialRule: v as ConsumptionFinancialRule
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(Object.keys(FINANCIAL_RULE_LABELS) as ConsumptionFinancialRule[]).map(
                                  (k) => (
                                    <SelectItem key={k} value={k}>
                                      {FINANCIAL_RULE_LABELS[k]}
                                    </SelectItem>
                                  )
                                )}
                              </SelectContent>
                            </Select>
                          </label>
                          <label className="block text-sm">
                            <span className="mb-1 block font-medium text-slate-700">
                              Disponibilidade da quantidade
                            </span>
                            <Select
                              value={item.consumptionAvailability || "CONTRACT_TERM"}
                              onValueChange={(v) =>
                                updateItem(item.key, {
                                  consumptionAvailability: v as ConsumptionAvailabilityPeriod
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(Object.keys(AVAILABILITY_LABELS) as ConsumptionAvailabilityPeriod[]).map(
                                  (k) => (
                                    <SelectItem key={k} value={k}>
                                      {AVAILABILITY_LABELS[k]}
                                    </SelectItem>
                                  )
                                )}
                              </SelectContent>
                            </Select>
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={item.consumptionAccumulates}
                              onChange={(e) =>
                                updateItem(item.key, { consumptionAccumulates: e.target.checked })
                              }
                            />
                            <span className="text-slate-700">
                              Saldo não utilizado acumula para o período seguinte
                            </span>
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={item.consumptionRequiresValidation}
                              onChange={(e) =>
                                updateItem(item.key, {
                                  consumptionRequiresValidation: e.target.checked
                                })
                              }
                            />
                            <span className="text-slate-700">
                              Exige validação antes de reduzir o saldo definitivo
                            </span>
                          </label>
                        </div>
                      )}
                    </div>
                    {(item.billingKind === "RECURRING" || item.billingKind === "ON_DEMAND") && (
                      <>
                        <label className="block text-sm">
                          <span className="mb-1 block font-medium text-slate-700">Início da incidência</span>
                          <Input
                            type="date"
                            value={item.periodStart}
                            onChange={(e) => updateItem(item.key, { periodStart: e.target.value })}
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="mb-1 block font-medium text-slate-700">Fim da incidência</span>
                          <Input
                            type="date"
                            value={item.periodEnd}
                            onChange={(e) => updateItem(item.key, { periodEnd: e.target.value })}
                          />
                        </label>
                      </>
                    )}
                    {cancelled ? (
                      <div className="sm:col-span-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => updateItem(item.key, { status: "ACTIVE" })}
                        >
                          Reativar item
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={addItem} disabled={qCatalog.isPending}>
          <Plus className="mr-1 h-4 w-4" />
          Adicionar item
        </Button>
      </div>

      <div className="grid gap-2 rounded-md border border-slate-200 bg-slate-50/90 p-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">Recorrente previsto</p>
          <p className="font-medium text-slate-900">{formatBrl(totals.recurringPredicted)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">Valores únicos</p>
          <p className="font-medium text-slate-900">{formatBrl(totals.oneTime)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">Sob demanda</p>
          <p className="font-medium text-slate-900">{formatBrl(totals.onDemand)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">Valor global estimado</p>
          <p className="font-semibold text-slate-900">{formatBrl(totals.globalEstimated)}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Mensalidade equivalente: {formatBrl(totals.monthlyValue)}
          </p>
        </div>
      </div>

      <details className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium text-slate-800">Incluir unidade ou tipo no catálogo</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs text-slate-500">Nova unidade de medida (código gerado a partir do rótulo).</p>
            <div className="flex gap-2">
              <Input
                value={newUnitLabel}
                onChange={(e) => setNewUnitLabel(e.target.value)}
                placeholder="Ex.: Sessão"
              />
              <Button
                type="button"
                variant="outline"
                disabled={!newUnitLabel.trim() || createUnitMut.isPending}
                onClick={() => {
                  const label = newUnitLabel.trim();
                  createUnitMut.mutate({ code: label, label });
                }}
              >
                Incluir
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-slate-500">Novo tipo padronizado (administração rápida).</p>
            <div className="flex gap-2">
              <Input
                value={newTypeLabel}
                onChange={(e) => setNewTypeLabel(e.target.value)}
                placeholder="Ex.: Consultoria"
              />
              <Button
                type="button"
                variant="outline"
                disabled={!newTypeLabel.trim() || createTypeMut.isPending}
                onClick={() => {
                  const label = newTypeLabel.trim();
                  createTypeMut.mutate({ code: label, label });
                }}
              >
                Incluir
              </Button>
            </div>
          </div>
        </div>
      </details>

      {lockHardDelete ? (
        <p className="text-xs text-amber-800">
          Este contrato já possui medições ou aditivos. Itens existentes não podem ser
          excluídos definitivamente: use cancelamento para inativá-los.
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
