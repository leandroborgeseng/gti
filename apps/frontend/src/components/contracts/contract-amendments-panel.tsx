"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import type {
  Contract,
  ContractAmendment,
  ContractAmendmentItemAction,
  ContractAmendmentType,
  ContractPricingBillingKind,
  ContractPricingItem,
  ContractPricingPeriodicity,
  CreateContractAmendmentPayload
} from "@/lib/api";
import {
  cancelContractAmendment,
  createContractAmendment,
  getContractPricingCatalog
} from "@/lib/api";
import { useAuthMe } from "@/hooks/use-auth-me";
import { queryKeys } from "@/lib/query-keys";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { FormField, FormSection, PrimaryButton, formControlClass } from "@/components/ui/form-primitives";
import { formatBrl } from "@/lib/format-brl";

const AMENDMENT_TYPE_LABELS: Record<ContractAmendmentType, string> = {
  TERMO_ADITIVO: "Termo aditivo",
  REAJUSTE: "Reajuste",
  REPACTUACAO: "Repactuação",
  REVISAO: "Revisão",
  RENOVACAO: "Renovação",
  PRORROGACAO: "Prorrogação",
  ACRESCIMO: "Acréscimo",
  SUPRESSAO: "Supressão",
  APOSTILAMENTO: "Apostilamento",
  OUTRO: "Outro"
};

const ACTION_LABELS: Record<ContractAmendmentItemAction, string> = {
  CREATE: "Inclusão",
  UPDATE: "Alteração / reajuste",
  SUPPRESS: "Supressão",
  INCREASE_QUANTITY: "Acrescentar quantidade",
  RENEW_QUANTITY: "Renovar quantidade/período",
  CLOSE_ITEM: "Encerrar item"
};

const PERIODICITY_LABELS: Record<ContractPricingPeriodicity, string> = {
  MONTHLY: "Mensal",
  BIMONTHLY: "Bimestral",
  QUARTERLY: "Trimestral",
  SEMIANNUAL: "Semestral",
  ANNUAL: "Anual",
  CUSTOM: "Outra"
};

type DraftItem = {
  key: string;
  selected: boolean;
  action: ContractAmendmentItemAction;
  pricingItemId?: string;
  description: string;
  typeId: string;
  unitId: string;
  quantity: string;
  unitValue: string;
  totalValue: string;
  billingKind: ContractPricingBillingKind;
  periodicity: ContractPricingPeriodicity | "";
  adjustmentPercent: string;
  beforeTotal: number;
};

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const s = String(iso);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function formatDatePt(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("pt-BR");
}

function todayDateInputValue(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseNum(s: string): number {
  const n = Number(String(s).trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

function money(n: number | string | null | undefined): number {
  if (n == null || n === "") return 0;
  const v = typeof n === "number" ? n : Number(String(n).replace(",", "."));
  return Number.isFinite(v) ? v : 0;
}

function pctDelta(before: number, after: number): number | null {
  if (before === 0) return after === 0 ? 0 : null;
  return Math.round(((after - before) / before) * 10000) / 100;
}

function activePricingItems(items: ContractPricingItem[] | undefined): ContractPricingItem[] {
  const today = todayDateInputValue();
  return (items ?? []).filter((item) => {
    if (item.status !== "ACTIVE") return false;
    const start = toDateInputValue(item.periodStart);
    const end = toDateInputValue(item.periodEnd);
    if (start && start > today) return false;
    if (end && end < today) return false;
    return true;
  });
}

function draftFromItem(item: ContractPricingItem): DraftItem {
  return {
    key: item.id,
    selected: false,
    action: "UPDATE",
    pricingItemId: item.id,
    description: item.description,
    typeId: item.typeId,
    unitId: item.unitId,
    quantity: String(item.quantity),
    unitValue: String(item.unitValue),
    totalValue: String(item.totalValue),
    billingKind: item.billingKind,
    periodicity: item.periodicity ?? "",
    adjustmentPercent: "",
    beforeTotal: money(item.totalValue)
  };
}

export function ContractAmendmentsPanel(props: { contract: Contract }): JSX.Element {
  const router = useRouter();
  const meQuery = useAuthMe();
  const role = meQuery.isError ? null : meQuery.data?.role;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [cancelFor, setCancelFor] = useState<string | null>(null);
  const [cancelJustification, setCancelJustification] = useState("");
  const catalogQuery = useQuery({
    queryKey: queryKeys.contractPricingCatalog,
    queryFn: getContractPricingCatalog,
    staleTime: 10 * 60_000
  });
  const catalog = catalogQuery.data
    ? {
        types: catalogQuery.data.types.filter((t) => t.active),
        units: catalogQuery.data.units.filter((u) => u.active)
      }
    : null;

  const [type, setType] = useState<ContractAmendmentType>("TERMO_ADITIVO");
  const [referenceCode, setReferenceCode] = useState("");
  const [formalizationDate, setFormalizationDate] = useState(todayDateInputValue());
  const [effectsStartDate, setEffectsStartDate] = useState(todayDateInputValue());
  const [newEndDate, setNewEndDate] = useState(toDateInputValue(props.contract.endDate));
  const [description, setDescription] = useState("");
  const [indexReference, setIndexReference] = useState("");
  const [draftItems, setDraftItems] = useState<DraftItem[]>(() =>
    activePricingItems(props.contract.pricingItems).map(draftFromItem)
  );
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    setDraftItems(activePricingItems(props.contract.pricingItems).map(draftFromItem));
    setNewEndDate(toDateInputValue(props.contract.endDate));
  }, [props.contract.id, props.contract.pricingItems, props.contract.endDate]);

  const canEdit = role === "ADMIN" || role === "EDITOR";
  const contractActive = props.contract.status === "ACTIVE";
  const list = props.contract.amendments ?? [];
  const previousGlobal = money(props.contract.globalValueCurrent ?? props.contract.totalValue);

  const selectedDrafts = draftItems.filter((d) => d.selected);

  const comparison = useMemo(() => {
    let afterGlobal = previousGlobal;
    const lines: Array<{ label: string; before: number; after: number; action: string }> = [];
    for (const d of selectedDrafts) {
      const before = d.beforeTotal;
      let after = before;
      if (d.action === "SUPPRESS" || d.action === "CLOSE_ITEM") after = 0;
      else {
        const qty = parseNum(d.quantity);
        const uv = parseNum(d.unitValue);
        const tv = parseNum(d.totalValue);
        after = Number.isFinite(tv) ? tv : Number.isFinite(qty) && Number.isFinite(uv) ? Math.round(qty * uv * 100) / 100 : before;
      }
      if (d.action === "CREATE") {
        afterGlobal += after;
      } else if (d.action === "SUPPRESS" || d.action === "CLOSE_ITEM") {
        afterGlobal -= before;
      } else {
        afterGlobal += after - before;
      }
      lines.push({ label: d.description || "Novo item", before, after, action: ACTION_LABELS[d.action] });
    }
    const delta = afterGlobal - previousGlobal;
    const pct = pctDelta(previousGlobal, afterGlobal);
    return { afterGlobal, delta, pct, lines };
  }, [selectedDrafts, previousGlobal]);

  function toggleItem(key: string): void {
    setDraftItems((prev) => prev.map((d) => (d.key === key ? { ...d, selected: !d.selected } : d)));
  }

  function updateDraft(key: string, patch: Partial<DraftItem>): void {
    setDraftItems((prev) =>
      prev.map((d) => {
        if (d.key !== key) return d;
        const next = { ...d, ...patch };
        if (patch.quantity != null || patch.unitValue != null) {
          const qty = parseNum(patch.quantity ?? next.quantity);
          const uv = parseNum(patch.unitValue ?? next.unitValue);
          if (Number.isFinite(qty) && Number.isFinite(uv)) {
            next.totalValue = String(Math.round(qty * uv * 100) / 100);
          }
        }
        if (patch.adjustmentPercent != null && d.action !== "CREATE" && d.beforeTotal > 0) {
          const p = parseNum(patch.adjustmentPercent);
          if (Number.isFinite(p)) {
            const uv = Math.round(d.beforeTotal * (1 + p / 100) * 100) / 100;
            // Aplica % sobre o total; recalcula unitário se qty conhecida.
            const qty = parseNum(next.quantity);
            next.totalValue = String(uv);
            if (Number.isFinite(qty) && qty > 0) {
              next.unitValue = String(Math.round((uv / qty) * 10000) / 10000);
            }
          }
        }
        return next;
      })
    );
  }

  function addNewItemRow(): void {
    const typeId = catalog?.types[0]?.id ?? "";
    const unitId = catalog?.units[0]?.id ?? "";
    setDraftItems((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}`,
        selected: true,
        action: "CREATE",
        description: "",
        typeId,
        unitId,
        quantity: "1",
        unitValue: "0",
        totalValue: "0",
        billingKind: "RECURRING",
        periodicity: "MONTHLY",
        adjustmentPercent: "",
        beforeTotal: 0
      }
    ]);
  }

  async function onSubmit(): Promise<void> {
    if (!canEdit) return;
    if (!description.trim()) {
      setErr("Informe a descrição/observação do aditivo.");
      return;
    }
    if (!effectsStartDate) {
      setErr("Informe o início dos efeitos.");
      return;
    }
    if (selectedDrafts.length === 0 && !newEndDate) {
      setErr("Selecione ao menos um item afetado ou informe o novo término.");
      return;
    }

    const items: CreateContractAmendmentPayload["items"] = [];
    for (const d of selectedDrafts) {
      if (d.action === "SUPPRESS") {
        if (!d.pricingItemId) {
          setErr("Supressão sem item de origem.");
          return;
        }
        items.push({
          action: "SUPPRESS",
          pricingItemId: d.pricingItemId,
          adjustmentPercent: parseNum(d.adjustmentPercent) || undefined
        });
        continue;
      }
      const qty = parseNum(d.quantity);
      const uv = parseNum(d.unitValue);
      const tv = parseNum(d.totalValue);
      if (!d.description.trim() || !d.typeId || !d.unitId || !Number.isFinite(qty) || !Number.isFinite(uv)) {
        setErr(`Preencha os dados do item «${d.description || "novo"}».`);
        return;
      }
      items.push({
        action: d.action,
        pricingItemId: d.pricingItemId,
        adjustmentPercent: parseNum(d.adjustmentPercent) || undefined,
        after: {
          typeId: d.typeId,
          description: d.description.trim(),
          unitId: d.unitId,
          quantity: qty,
          unitValue: uv,
          totalValue: Number.isFinite(tv) ? tv : undefined,
          billingKind: d.billingKind,
          periodicity: d.billingKind === "RECURRING" ? d.periodicity || "MONTHLY" : null,
          includeInGlosaBase: false
        }
      });
    }

    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      await createContractAmendment(props.contract.id, {
        type,
        referenceCode: referenceCode.trim() || undefined,
        formalizationDate: formalizationDate || undefined,
        effectsStartDate,
        description: description.trim(),
        newEndDate: newEndDate || undefined,
        indexReference: indexReference.trim() || undefined,
        items
      });
      setOk("Aditivo registrado. Histórico e valores do contrato atualizados.");
      setShowForm(false);
      setDescription("");
      setDraftItems(activePricingItems(props.contract.pricingItems).map(draftFromItem));
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível registrar o aditivo.");
    } finally {
      setBusy(false);
    }
  }

  async function onCancelAmendment(amendmentId: string): Promise<void> {
    if (!cancelJustification.trim() || cancelJustification.trim().length < 3) {
      setErr("Informe a justificativa do cancelamento (mínimo 3 caracteres).");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await cancelContractAmendment(props.contract.id, amendmentId, cancelJustification.trim());
      setOk("Aditivo cancelado formalmente. Os itens não são revertidos automaticamente — registre um aditivo corretivo se necessário.");
      setCancelFor(null);
      setCancelJustification("");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível cancelar o aditivo.");
    } finally {
      setBusy(false);
    }
  }

  const originalRow = {
    id: "original",
    label: "Situação original / contratação",
    date: props.contract.startDate,
    global: money(props.contract.globalValueOriginal ?? props.contract.totalValue),
    monthly: money(props.contract.monthlyValue),
    endDate: props.contract.endDate,
    description: "Valores na contratação (antes dos aditivos)."
  };

  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold text-slate-900">Aditivos, reajustes e histórico contratual</h2>
      <p className="mt-1 text-sm text-slate-600">
        Registro formal por tipo de alteração, com itens afetados, início dos efeitos e impacto no{" "}
        <strong className="font-medium text-slate-800">valor global</strong>. O histórico abaixo é automático (original +
        cada aditivo) e não admite edição comum.
      </p>

      {role === undefined ? (
        <p className="mt-4 text-sm text-slate-500">Carregando permissões…</p>
      ) : canEdit && !contractActive ? (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Só é possível registrar novos aditivos com o contrato em estado <strong className="font-medium">Ativo</strong>.
        </p>
      ) : canEdit ? (
        <div className="mt-4 border-t border-slate-100 pt-4">
          {!showForm ? (
            <PrimaryButton type="button" onClick={() => setShowForm(true)}>
              Novo aditivo / reajuste
            </PrimaryButton>
          ) : (
            <div className="space-y-4">
              <FormSection title="Instrumento" description="Tipo, datas e descrição obrigatória.">
                <FormField label="Tipo de alteração" htmlFor="amend-type" required>
                  <select
                    id="amend-type"
                    className={formControlClass}
                    value={type}
                    onChange={(e) => setType(e.target.value as ContractAmendmentType)}
                  >
                    {(Object.keys(AMENDMENT_TYPE_LABELS) as ContractAmendmentType[]).map((k) => (
                      <option key={k} value={k}>
                        {AMENDMENT_TYPE_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Referência do instrumento" htmlFor="amend-ref">
                  <input
                    id="amend-ref"
                    className={formControlClass}
                    value={referenceCode}
                    onChange={(e) => setReferenceCode(e.target.value)}
                    placeholder="Ex.: 1º termo aditivo, SEI nº …"
                  />
                </FormField>
                <FormField label="Data de formalização" htmlFor="amend-formal">
                  <input
                    id="amend-formal"
                    type="date"
                    className={formControlClass}
                    value={formalizationDate}
                    onChange={(e) => setFormalizationDate(e.target.value)}
                  />
                </FormField>
                <FormField label="Início dos efeitos" htmlFor="amend-effects" required>
                  <input
                    id="amend-effects"
                    type="date"
                    required
                    className={formControlClass}
                    value={effectsStartDate}
                    onChange={(e) => setEffectsStartDate(e.target.value)}
                  />
                </FormField>
                <FormField label="Novo término do contrato (opcional)" htmlFor="amend-end">
                  <input
                    id="amend-end"
                    type="date"
                    className={formControlClass}
                    value={newEndDate}
                    onChange={(e) => setNewEndDate(e.target.value)}
                  />
                </FormField>
                <FormField label="Índice / referência de reajuste" htmlFor="amend-index">
                  <input
                    id="amend-index"
                    className={formControlClass}
                    value={indexReference}
                    onChange={(e) => setIndexReference(e.target.value)}
                    placeholder="Ex.: IPCA, IGP-M"
                  />
                </FormField>
                <FormField label="Descrição / observação" htmlFor="amend-desc" required className="sm:col-span-2">
                  <textarea
                    id="amend-desc"
                    required
                    rows={3}
                    className={formControlClass}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Resumo do que foi alterado e fundamentação."
                  />
                </FormField>
              </FormSection>

              <FormSection
                title="Itens afetados"
                description="Marque os itens a alterar. Não selecionados permanecem iguais. Supressão encerra a vigência (não apaga)."
              >
                <div className="sm:col-span-2 space-y-3">
                  {draftItems.map((d) => (
                    <div
                      key={d.key}
                      className={`rounded-md border px-3 py-3 ${d.selected ? "border-slate-400 bg-slate-50" : "border-slate-200"}`}
                    >
                      <label className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={d.selected}
                          onChange={() => toggleItem(d.key)}
                          disabled={d.action === "CREATE"}
                        />
                        <span className="font-medium text-slate-900">
                          {d.action === "CREATE" ? "Novo item" : d.description}
                        </span>
                      </label>
                      {d.selected ? (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                          {d.action !== "CREATE" ? (
                            <FormField label="Ação" htmlFor={`act-${d.key}`}>
                              <select
                                id={`act-${d.key}`}
                                className={formControlClass}
                                value={d.action}
                                onChange={(e) =>
                                  updateDraft(d.key, { action: e.target.value as ContractAmendmentItemAction })
                                }
                              >
                                <option value="UPDATE">Alterar / reajustar</option>
                                <option value="INCREASE_QUANTITY">Acrescentar quantidade</option>
                                <option value="RENEW_QUANTITY">Renovar quantidade/período</option>
                                <option value="SUPPRESS">Suprimir (encerrar)</option>
                                <option value="CLOSE_ITEM">Encerrar item</option>
                              </select>
                            </FormField>
                          ) : null}
                          {d.action !== "SUPPRESS" ? (
                            <>
                              {d.action === "CREATE" ? (
                                <>
                                  <FormField label="Descrição" htmlFor={`desc-${d.key}`} className="sm:col-span-2">
                                    <input
                                      id={`desc-${d.key}`}
                                      className={formControlClass}
                                      value={d.description}
                                      onChange={(e) => updateDraft(d.key, { description: e.target.value })}
                                    />
                                  </FormField>
                                  <FormField label="Tipo" htmlFor={`type-${d.key}`}>
                                    <select
                                      id={`type-${d.key}`}
                                      className={formControlClass}
                                      value={d.typeId}
                                      onChange={(e) => updateDraft(d.key, { typeId: e.target.value })}
                                    >
                                      {(catalog?.types ?? []).map((t) => (
                                        <option key={t.id} value={t.id}>
                                          {t.label}
                                        </option>
                                      ))}
                                    </select>
                                  </FormField>
                                  <FormField label="Unidade" htmlFor={`unit-${d.key}`}>
                                    <select
                                      id={`unit-${d.key}`}
                                      className={formControlClass}
                                      value={d.unitId}
                                      onChange={(e) => updateDraft(d.key, { unitId: e.target.value })}
                                    >
                                      {(catalog?.units ?? []).map((u) => (
                                        <option key={u.id} value={u.id}>
                                          {u.label}
                                        </option>
                                      ))}
                                    </select>
                                  </FormField>
                                  <FormField label="Cobrança" htmlFor={`bill-${d.key}`}>
                                    <select
                                      id={`bill-${d.key}`}
                                      className={formControlClass}
                                      value={d.billingKind}
                                      onChange={(e) =>
                                        updateDraft(d.key, { billingKind: e.target.value as ContractPricingBillingKind })
                                      }
                                    >
                                      <option value="RECURRING">Recorrente</option>
                                      <option value="ONE_TIME">Valor único</option>
                                      <option value="ON_DEMAND">Sob demanda</option>
                                    </select>
                                  </FormField>
                                </>
                              ) : null}
                              <FormField label="Quantidade" htmlFor={`qty-${d.key}`}>
                                <input
                                  id={`qty-${d.key}`}
                                  className={`${formControlClass} tabular-nums`}
                                  value={d.quantity}
                                  onChange={(e) => updateDraft(d.key, { quantity: e.target.value })}
                                />
                              </FormField>
                              <FormField label="Valor unitário (R$)" htmlFor={`uv-${d.key}`}>
                                <input
                                  id={`uv-${d.key}`}
                                  className={`${formControlClass} tabular-nums`}
                                  value={d.unitValue}
                                  onChange={(e) => updateDraft(d.key, { unitValue: e.target.value })}
                                />
                              </FormField>
                              <FormField label="Valor total (R$)" htmlFor={`tv-${d.key}`}>
                                <input
                                  id={`tv-${d.key}`}
                                  className={`${formControlClass} tabular-nums`}
                                  value={d.totalValue}
                                  onChange={(e) => updateDraft(d.key, { totalValue: e.target.value })}
                                />
                              </FormField>
                              <FormField label="% reajuste / acréscimo" htmlFor={`pct-${d.key}`}>
                                <input
                                  id={`pct-${d.key}`}
                                  className={`${formControlClass} tabular-nums`}
                                  value={d.adjustmentPercent}
                                  onChange={(e) => updateDraft(d.key, { adjustmentPercent: e.target.value })}
                                  placeholder="Ex.: 5"
                                />
                              </FormField>
                              {d.billingKind === "RECURRING" ? (
                                <FormField label="Periodicidade" htmlFor={`per-${d.key}`}>
                                  <select
                                    id={`per-${d.key}`}
                                    className={formControlClass}
                                    value={d.periodicity}
                                    onChange={(e) =>
                                      updateDraft(d.key, {
                                        periodicity: e.target.value as ContractPricingPeriodicity | ""
                                      })
                                    }
                                  >
                                    {(Object.keys(PERIODICITY_LABELS) as ContractPricingPeriodicity[]).map((k) => (
                                      <option key={k} value={k}>
                                        {PERIODICITY_LABELS[k]}
                                      </option>
                                    ))}
                                  </select>
                                </FormField>
                              ) : null}
                            </>
                          ) : (
                            <p className="sm:col-span-3 text-xs text-slate-600">
                              A vigência será encerrada no dia anterior ao início dos efeitos e o item ficará cancelado
                              (histórico preservado).
                            </p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-sm font-medium text-slate-700 underline-offset-2 hover:underline"
                    onClick={() => addNewItemRow()}
                  >
                    <Plus className="h-4 w-4" /> Incluir novo item via aditivo
                  </button>
                </div>
              </FormSection>

              {selectedDrafts.length > 0 || newEndDate !== toDateInputValue(props.contract.endDate) ? (
                <div className="rounded-md border border-slate-200 bg-white px-3 py-3 text-sm">
                  <p className="font-semibold text-slate-900">Resumo comparativo (antes de confirmar)</p>
                  <p className="mt-1 text-slate-600">
                    Valor global: {formatBrl(previousGlobal)} → {formatBrl(comparison.afterGlobal)}{" "}
                    <span className="tabular-nums text-slate-800">
                      ({comparison.delta >= 0 ? "+" : "−"}
                      {formatBrl(Math.abs(comparison.delta))}
                      {comparison.pct != null ? ` · ${comparison.pct >= 0 ? "+" : ""}${comparison.pct}%` : ""})
                    </span>
                  </p>
                  {comparison.lines.length > 0 ? (
                    <ul className="mt-2 divide-y divide-slate-100">
                      {comparison.lines.map((l, idx) => (
                        <li key={`${l.label}-${idx}`} className="py-1.5 text-xs text-slate-600">
                          <span className="font-medium text-slate-800">{l.action}</span> · {l.label}: {formatBrl(l.before)} →{" "}
                          {formatBrl(l.after)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <PrimaryButton type="button" busy={busy} busyLabel="Salvando…" onClick={() => void onSubmit()}>
                  Confirmar aditivo
                </PrimaryButton>
                <button
                  type="button"
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700"
                  onClick={() => setShowForm(false)}
                  disabled={busy}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-600">O seu perfil só permite consultar o histórico de aditivos.</p>
      )}

      {err ? (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {err}
        </p>
      ) : null}
      {ok ? (
        <p className="mt-3 text-sm text-emerald-800" role="status">
          {ok}
        </p>
      ) : null}

      <div className="mt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Histórico automático</h3>
        <ul className="mt-3 divide-y divide-slate-100 rounded-md border border-slate-200">
          <li className="px-3 py-3 text-sm text-slate-700">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium text-slate-900">{originalRow.label}</span>
              <span className="text-xs text-slate-500">{formatDatePt(originalRow.date)}</span>
            </div>
            <p className="mt-1 text-slate-600">{originalRow.description}</p>
            <p className="mt-2 text-xs text-slate-500">
              Global: {formatBrl(originalRow.global)} · Término: {formatDatePt(originalRow.endDate)}
            </p>
          </li>
          {list.length === 0 ? (
            <li className="px-3 py-3 text-sm text-slate-500">Ainda não existem aditivos registrados para este contrato.</li>
          ) : (
            list.map((a) => (
              <HistoryRow
                key={a.id}
                amendment={a}
                expanded={Boolean(expanded[a.id])}
                onToggle={() => setExpanded((prev) => ({ ...prev, [a.id]: !prev[a.id] }))}
                canCancel={canEdit && a.status !== "CANCELLED"}
                cancelOpen={cancelFor === a.id}
                cancelJustification={cancelJustification}
                onOpenCancel={() => {
                  setCancelFor(a.id);
                  setCancelJustification("");
                }}
                onCloseCancel={() => setCancelFor(null)}
                onChangeJustification={setCancelJustification}
                onConfirmCancel={() => void onCancelAmendment(a.id)}
                busy={busy}
              />
            ))
          )}
        </ul>
      </div>
    </Card>
  );
}

function HistoryRow(props: {
  amendment: ContractAmendment;
  expanded: boolean;
  onToggle: () => void;
  canCancel: boolean;
  cancelOpen: boolean;
  cancelJustification: string;
  onOpenCancel: () => void;
  onCloseCancel: () => void;
  onChangeJustification: (v: string) => void;
  onConfirmCancel: () => void;
  busy: boolean;
}): JSX.Element {
  const a = props.amendment;
  const cancelled = a.status === "CANCELLED";
  const prevG = money(a.previousGlobalValue ?? a.previousTotalValue);
  const nextG = money(a.newGlobalValue ?? a.newTotalValue);
  const delta = nextG - prevG;
  const pct = a.adjustmentPercent != null ? money(a.adjustmentPercent) : pctDelta(prevG, nextG);
  const items = a.items ?? [];

  return (
    <li className={`px-3 py-3 text-sm ${cancelled ? "bg-slate-50 text-slate-500" : "text-slate-700"}`}>
      <button type="button" className="flex w-full items-start gap-2 text-left" onClick={props.onToggle}>
        {items.length > 0 ? (
          props.expanded ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <span className="mt-0.5 inline-block h-4 w-4 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium text-slate-900">
              {AMENDMENT_TYPE_LABELS[a.type ?? "OUTRO"]}
              {cancelled ? " (cancelado)" : ""}
            </span>
            <span className="text-xs text-slate-500">Efeitos: {formatDatePt(a.effectiveDate)}</span>
          </div>
          {a.referenceCode ? <p className="mt-0.5 text-xs text-slate-500">{a.referenceCode}</p> : null}
          <p className="mt-1 text-slate-600">{a.description}</p>
          <p className="mt-2 text-xs text-slate-500">
            Global: {formatBrl(prevG)} → {formatBrl(nextG)} ({delta >= 0 ? "+" : "−"}
            {formatBrl(Math.abs(delta))}
            {pct != null ? ` · ${pct >= 0 ? "+" : ""}${pct}%` : ""})
            {a.newEndDate ? ` · Término: ${formatDatePt(a.previousEndDate)} → ${formatDatePt(a.newEndDate)}` : ""}
          </p>
          {a.actorLabel ? <p className="mt-1 text-xs text-slate-400">Registrado por {a.actorLabel}</p> : null}
          {cancelled && a.cancelJustification ? (
            <p className="mt-1 text-xs text-amber-800">Cancelamento: {a.cancelJustification}</p>
          ) : null}
        </div>
      </button>

      {props.expanded && items.length > 0 ? (
        <ul className="mt-2 ml-6 space-y-2 border-l border-slate-200 pl-3">
          {items.map((it) => {
            const before = it.beforeSnapshot;
            const after = it.afterSnapshot;
            return (
              <li key={it.id} className="text-xs text-slate-600">
                <span className="font-medium text-slate-800">{ACTION_LABELS[it.action]}</span>
                {" · "}
                {after?.description || before?.description || "Item"}
                {before || after ? (
                  <span className="block tabular-nums text-slate-500">
                    {formatBrl(before?.totalValue ?? 0)} → {formatBrl(after?.totalValue ?? 0)}
                    {after?.periodicity ? ` · ${PERIODICITY_LABELS[after.periodicity] ?? after.periodicity}` : ""}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {props.canCancel ? (
        <div className="mt-2 ml-6">
          {!props.cancelOpen ? (
            <button
              type="button"
              className="text-xs font-medium text-red-700 underline-offset-2 hover:underline"
              onClick={props.onOpenCancel}
            >
              Cancelar formalmente…
            </button>
          ) : (
            <div className="space-y-2 rounded-md border border-red-200 bg-red-50 p-2">
              <p className="text-xs text-red-900">
                O cancelamento marca o registro como cancelado e não reverte automaticamente os itens. Use um aditivo
                corretivo se precisar desfazer valores.
              </p>
              <textarea
                className={formControlClass}
                rows={2}
                value={props.cancelJustification}
                onChange={(e) => props.onChangeJustification(e.target.value)}
                placeholder="Justificativa do cancelamento"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-md bg-red-700 px-2 py-1 text-xs text-white disabled:opacity-50"
                  disabled={props.busy}
                  onClick={props.onConfirmCancel}
                >
                  Confirmar cancelamento
                </button>
                <button type="button" className="text-xs text-slate-600" onClick={props.onCloseCancel}>
                  Fechar
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </li>
  );
}
