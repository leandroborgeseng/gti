"use client";

import type { Route } from "next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ContractFeatureStatus,
  ContractItemCriticality,
  ContractItemDeliveryStatus,
  ContractModulesDeliveryOverview
} from "@/lib/api";
import { formatBrl } from "@/lib/format-brl";
import { itemDeliveryLabelClass, itemDeliverySelectItemClass, itemDeliverySelectTriggerClass } from "@/lib/item-delivery-styles";
import { deleteContractFeature, getModulesDeliveryOverview, updateContractFeature } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const deliveryLabels: Record<ContractItemDeliveryStatus, string> = {
  NOT_DELIVERED: "Não entregue",
  PARTIALLY_DELIVERED: "Parcialmente entregue",
  DELIVERED: "Entregue"
};

const deliveryOptions: ContractItemDeliveryStatus[] = ["NOT_DELIVERED", "PARTIALLY_DELIVERED", "DELIVERED"];

const featureStatusLabels: Record<ContractFeatureStatus, string> = {
  NOT_STARTED: "Não iniciada",
  IN_PROGRESS: "Em progresso",
  DELIVERED: "Entregue",
  VALIDATED: "Validada"
};

const featureStatuses: ContractFeatureStatus[] = ["NOT_STARTED", "IN_PROGRESS", "DELIVERED", "VALIDATED"];

const criticalityLabels: Record<ContractItemCriticality, string> = {
  CRITICA: "Crítica (5)",
  ALTA: "Alta (4)",
  MEDIA: "Média (3)",
  BAIXA: "Baixa (2)",
  APOIO: "Apoio (1)"
};

const criticalityOptions: ContractItemCriticality[] = ["CRITICA", "ALTA", "MEDIA", "BAIXA", "APOIO"];

function criticalitySelectTriggerClass(criticality: ContractItemCriticality): string {
  const ring = "font-medium focus:outline-none focus:ring-1 focus:ring-offset-0 focus:ring-offset-background disabled:opacity-50";
  switch (criticality) {
    case "APOIO":
      return `${ring} border-emerald-200 bg-emerald-50/80 text-emerald-800 dark:border-emerald-800/90 dark:bg-emerald-950/35 dark:text-emerald-300 dark:focus:ring-emerald-700 focus:ring-emerald-300`;
    case "BAIXA":
      return `${ring} border-lime-200 bg-lime-50/80 text-lime-800 dark:border-lime-800/90 dark:bg-lime-950/35 dark:text-lime-300 dark:focus:ring-lime-700 focus:ring-lime-300`;
    case "MEDIA":
      return `${ring} border-amber-200 bg-amber-50/80 text-amber-800 dark:border-amber-800/90 dark:bg-amber-950/35 dark:text-amber-300 dark:focus:ring-amber-700 focus:ring-amber-300`;
    case "ALTA":
      return `${ring} border-orange-200 bg-orange-50/80 text-orange-800 dark:border-orange-800/90 dark:bg-orange-950/35 dark:text-orange-300 dark:focus:ring-orange-700 focus:ring-orange-300`;
    case "CRITICA":
      return `${ring} border-rose-200 bg-rose-50/80 text-rose-800 dark:border-rose-800/90 dark:bg-rose-950/40 dark:text-rose-300 dark:focus:ring-rose-700 focus:ring-rose-300`;
    default:
      return `${ring} text-muted-foreground`;
  }
}

function criticalitySelectItemClass(criticality: ContractItemCriticality): string {
  switch (criticality) {
    case "APOIO":
      return "text-emerald-800 data-[highlighted]:bg-emerald-100 data-[highlighted]:text-emerald-950 focus:bg-emerald-100 focus:text-emerald-950 dark:text-emerald-300 dark:data-[highlighted]:bg-emerald-950/50 dark:data-[highlighted]:text-emerald-50 dark:focus:bg-emerald-950/50 dark:focus:text-emerald-50";
    case "BAIXA":
      return "text-lime-800 data-[highlighted]:bg-lime-100 data-[highlighted]:text-lime-950 focus:bg-lime-100 focus:text-lime-950 dark:text-lime-300 dark:data-[highlighted]:bg-lime-950/50 dark:data-[highlighted]:text-lime-50 dark:focus:bg-lime-950/50 dark:focus:text-lime-50";
    case "MEDIA":
      return "text-amber-800 data-[highlighted]:bg-amber-100 data-[highlighted]:text-amber-950 focus:bg-amber-100 focus:text-amber-950 dark:text-amber-300 dark:data-[highlighted]:bg-amber-950/50 dark:data-[highlighted]:text-amber-50 dark:focus:bg-amber-950/50 dark:focus:text-amber-50";
    case "ALTA":
      return "text-orange-800 data-[highlighted]:bg-orange-100 data-[highlighted]:text-orange-950 focus:bg-orange-100 focus:text-orange-950 dark:text-orange-300 dark:data-[highlighted]:bg-orange-950/50 dark:data-[highlighted]:text-orange-50 dark:focus:bg-orange-950/50 dark:focus:text-orange-50";
    case "CRITICA":
      return "text-rose-800 data-[highlighted]:bg-rose-100 data-[highlighted]:text-rose-950 focus:bg-rose-100 focus:text-rose-950 dark:text-rose-300 dark:data-[highlighted]:bg-rose-950/50 dark:data-[highlighted]:text-rose-50 dark:focus:bg-rose-950/50 dark:focus:text-rose-50";
    default:
      return "";
  }
}

function rowKey(contractId: string, moduleId: string, featureId: string): string {
  return `${contractId}-${moduleId}-${featureId}`;
}

function serializeWeight(w: unknown): string {
  return String(w ?? "");
}

function countItems(modules: ContractModulesDeliveryOverview["modules"]): number {
  return modules.reduce((s, m) => s + m.features.length, 0);
}

function countByDelivery(
  modules: ContractModulesDeliveryOverview["modules"],
  st: ContractItemDeliveryStatus
): number {
  let n = 0;
  for (const m of modules) {
    for (const f of m.features) {
      if (f.deliveryStatus === st) n++;
    }
  }
  return n;
}

function deliveryCompletionPercent(total: number, delivered: number, partial: number): number {
  if (total <= 0) return 0;
  return Math.round(((delivered + partial * 0.5) / total) * 100);
}

function DeliveryMiniChart({ total, delivered, partial, notDelivered }: { total: number; delivered: number; partial: number; notDelivered: number }): JSX.Element {
  const completion = deliveryCompletionPercent(total, delivered, partial);
  if (total <= 0) {
    return (
      <div className="min-w-[11rem] text-xs text-muted-foreground">
        <span>Sem requisitos</span>
      </div>
    );
  }

  const segments = [
    { key: "delivered", value: delivered, className: "bg-emerald-500" },
    { key: "partial", value: partial, className: "bg-amber-500" },
    { key: "notDelivered", value: notDelivered, className: "bg-rose-400" }
  ];

  return (
    <div className="min-w-[11rem] space-y-1">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="font-semibold tabular-nums text-foreground">{completion}% cumprido</span>
        <span className={itemDeliveryLabelClass("DELIVERED")}>
          {delivered}/{total} requisito(s)
        </span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-label={`${completion}% dos requisitos cumpridos`}>
        {segments.map((segment) =>
          segment.value > 0 ? (
            <span
              key={segment.key}
              className={segment.className}
              style={{ width: `${Math.max((segment.value / total) * 100, 4)}%` }}
            />
          ) : null
        )}
      </div>
      <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
        <span className={itemDeliveryLabelClass("DELIVERED")}>{delivered} entregues</span>
        <span className={itemDeliveryLabelClass("PARTIALLY_DELIVERED")}>{partial} parciais</span>
        <span className={itemDeliveryLabelClass("NOT_DELIVERED")}>{notDelivered} não entregues</span>
      </div>
    </div>
  );
}

/** Chave estável para o painel de um módulo (sanfona por módulo). */
function modulePanelKey(contractId: string, moduleId: string): string {
  return `${contractId}::${moduleId}`;
}

function countByDeliveryInModule(
  mod: ContractModulesDeliveryOverview["modules"][number],
  st: ContractItemDeliveryStatus
): number {
  let n = 0;
  for (const f of mod.features) {
    if (((f.deliveryStatus ?? "NOT_DELIVERED") as ContractItemDeliveryStatus) === st) n++;
  }
  return n;
}

/** Todas as chaves de módulo — estado inicial: todos colapsados (cada chave presente em `collapsedModuleKeys`). */
function buildAllModuleKeysFromRows(rows: ContractModulesDeliveryOverview[]): Set<string> {
  const s = new Set<string>();
  for (const c of rows) {
    for (const m of c.modules) {
      s.add(modulePanelKey(c.id, m.id));
    }
  }
  return s;
}

const contractTypeLabel: Record<string, string> = {
  SOFTWARE: "Software",
  INFRA: "Infraestrutura",
  SERVICO: "Serviço"
};

const statusLabel: Record<string, string> = {
  ACTIVE: "Ativo",
  EXPIRED: "Encerrado",
  SUSPENDED: "Suspenso"
};

type Props = {
  initialRows: ContractModulesDeliveryOverview[];
  dataLoadErrors?: string[];
};

type EditFeatureDraft = {
  contractId: string;
  moduleId: string;
  featureId: string;
  itemCode: string;
  name: string;
  weightStr: string;
  criticality: ContractItemCriticality;
  status: ContractFeatureStatus;
  deliveryStatus: ContractItemDeliveryStatus;
};

export function ModulesDeliveryView({ initialRows, dataLoadErrors = [] }: Props): JSX.Element {
  const qc = useQueryClient();
  /** Contratos expandidos (ausente = colapsado). Por padrão todos fechados — expanda para ver módulos e ações. */
  const [openContractIds, setOpenContractIds] = useState<Set<string>>(() => new Set());
  /** Módulos com corpo colapsado (chave ausente = expandido). Por padrão todos fechados. */
  const [collapsedModuleKeys, setCollapsedModuleKeys] = useState<Set<string>>(() =>
    buildAllModuleKeysFromRows(initialRows)
  );
  const [editDraft, setEditDraft] = useState<EditFeatureDraft | null>(null);
  const [editHint, setEditHint] = useState<string | null>(null);
  const moduleKeysSnapshotRef = useRef<Set<string> | null>(null);

  const { data: rows = initialRows } = useQuery({
    queryKey: queryKeys.modulesDeliveryOverview,
    queryFn: getModulesDeliveryOverview,
    initialData: initialRows
  });

  useEffect(() => {
    const current = buildAllModuleKeysFromRows(rows);
    const prev = moduleKeysSnapshotRef.current;
    moduleKeysSnapshotRef.current = current;

    if (prev === null) {
      setCollapsedModuleKeys((c) => {
        if (c.size > 0) return c;
        if (current.size === 0) return c;
        return new Set(current);
      });
      return;
    }

    const newKeys: string[] = [];
    for (const k of current) {
      if (!prev.has(k)) newKeys.push(k);
    }
    if (newKeys.length === 0) return;

    setCollapsedModuleKeys((c) => {
      const next = new Set(c);
      for (const k of newKeys) next.add(k);
      return next;
    });
  }, [rows]);

  const updateDeliveryMut = useMutation({
    mutationFn: async (vars: {
      contractId: string;
      moduleId: string;
      featureId: string;
      deliveryStatus: ContractItemDeliveryStatus;
    }) => {
      await updateContractFeature(vars.contractId, vars.moduleId, vars.featureId, {
        deliveryStatus: vars.deliveryStatus
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.modulesDeliveryOverview });
      void qc.invalidateQueries({ queryKey: queryKeys.contracts });
    }
  });

  const updateCriticalityMut = useMutation({
    mutationFn: async (vars: {
      contractId: string;
      moduleId: string;
      featureId: string;
      criticality: ContractItemCriticality;
    }) => {
      await updateContractFeature(vars.contractId, vars.moduleId, vars.featureId, {
        criticality: vars.criticality
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.modulesDeliveryOverview });
      void qc.invalidateQueries({ queryKey: queryKeys.contracts });
    }
  });

  const deleteFeatureMut = useMutation({
    mutationFn: async (vars: { contractId: string; moduleId: string; featureId: string }) => {
      await deleteContractFeature(vars.contractId, vars.moduleId, vars.featureId);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.modulesDeliveryOverview });
      void qc.invalidateQueries({ queryKey: queryKeys.contracts });
    }
  });

  const saveFeatureMut = useMutation({
    mutationFn: async (vars: {
      contractId: string;
      moduleId: string;
      featureId: string;
      itemCode?: string | null;
      name: string;
      criticality: ContractItemCriticality;
      status: ContractFeatureStatus;
      deliveryStatus: ContractItemDeliveryStatus;
    }) => {
      await updateContractFeature(vars.contractId, vars.moduleId, vars.featureId, {
        itemCode: vars.itemCode,
        name: vars.name,
        criticality: vars.criticality,
        status: vars.status,
        deliveryStatus: vars.deliveryStatus
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.modulesDeliveryOverview });
      void qc.invalidateQueries({ queryKey: queryKeys.contracts });
      setEditHint(null);
      setEditDraft(null);
    }
  });

  const busyRowKey =
    updateDeliveryMut.isPending && updateDeliveryMut.variables
      ? rowKey(
          updateDeliveryMut.variables.contractId,
          updateDeliveryMut.variables.moduleId,
          updateDeliveryMut.variables.featureId
        )
      : updateCriticalityMut.isPending && updateCriticalityMut.variables
        ? rowKey(
            updateCriticalityMut.variables.contractId,
            updateCriticalityMut.variables.moduleId,
            updateCriticalityMut.variables.featureId
          )
        : deleteFeatureMut.isPending && deleteFeatureMut.variables
        ? rowKey(
            deleteFeatureMut.variables.contractId,
            deleteFeatureMut.variables.moduleId,
            deleteFeatureMut.variables.featureId
          )
        : saveFeatureMut.isPending && saveFeatureMut.variables
          ? rowKey(saveFeatureMut.variables.contractId, saveFeatureMut.variables.moduleId, saveFeatureMut.variables.featureId)
          : null;

  const toggleContract = (id: string): void => {
    setOpenContractIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleModule = (contractId: string, moduleId: string): void => {
    const key = modulePanelKey(contractId, moduleId);
    setCollapsedModuleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const totalContracts = rows.length;
  const totalItems = useMemo(() => rows.reduce((s, r) => s + countItems(r.modules), 0), [rows]);

  function openEdit(
    contractId: string,
    mod: ContractModulesDeliveryOverview["modules"][number],
    item: ContractModulesDeliveryOverview["modules"][number]["features"][number]
  ): void {
    setEditHint(null);
    setEditDraft({
      contractId,
      moduleId: mod.id,
      featureId: item.id,
      itemCode: item.itemCode ?? "",
      name: item.name,
      weightStr: serializeWeight(item.weight),
      criticality: item.criticality ?? "MEDIA",
      status: (item.status as ContractFeatureStatus) ?? "NOT_STARTED",
      deliveryStatus: (item.deliveryStatus ?? "NOT_DELIVERED") as ContractItemDeliveryStatus
    });
  }

  function tryDeleteFeature(
    contractId: string,
    mod: ContractModulesDeliveryOverview["modules"][number],
    item: ContractModulesDeliveryOverview["modules"][number]["features"][number]
  ): void {
    if (!window.confirm(`Remover a funcionalidade «${item.name}»?`)) return;
    deleteFeatureMut.mutate({ contractId, moduleId: mod.id, featureId: item.id });
  }

  function submitEdit(): void {
    if (!editDraft) return;
    setEditHint(null);
    const name = editDraft.name.trim();
    if (!name) {
      setEditHint("Indique um nome.");
      return;
    }
    saveFeatureMut.mutate({
      contractId: editDraft.contractId,
      moduleId: editDraft.moduleId,
      featureId: editDraft.featureId,
      itemCode: editDraft.itemCode.trim() || null,
      name,
      criticality: editDraft.criticality,
      status: editDraft.status,
      deliveryStatus: editDraft.deliveryStatus
    });
  }

  const mutationError =
    (updateDeliveryMut.error instanceof Error ? updateDeliveryMut.error.message : null) ??
    (updateCriticalityMut.error instanceof Error ? updateCriticalityMut.error.message : null) ??
    (deleteFeatureMut.error instanceof Error ? deleteFeatureMut.error.message : null) ??
    (saveFeatureMut.error instanceof Error ? saveFeatureMut.error.message : null);

  return (
    <div className="space-y-6">
      {dataLoadErrors.length > 0 ? <DataLoadAlert messages={dataLoadErrors} /> : null}

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Funcionalidades</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Por contrato: <strong className="font-medium text-foreground">contratos</strong> e{" "}
          <strong className="font-medium text-foreground">módulos</strong> em sanfona (fechados por padrão; contagem por estado de entrega no cabeçalho de cada módulo) e respectivas{" "}
          <strong className="font-medium text-foreground">funcionalidades</strong> (itens de entrega). Cada funcionalidade
          registra se a entrega está <strong className="font-medium text-foreground">não feita</strong>,{" "}
          <strong className="font-medium text-foreground">parcial</strong> ou <strong className="font-medium text-foreground">concluída</strong>,
          para acompanhar se o contrato está sendo prestado. A criticidade também pode ser ajustada na linha, em escala colorida de{" "}
          <strong className="font-medium text-emerald-700 dark:text-emerald-300">apoio (1)</strong> a{" "}
          <strong className="font-medium text-rose-700 dark:text-rose-300">crítica (5)</strong>. No indicador proporcional ao valor mensal, cada parcial conta como{" "}
          <strong className="font-medium text-foreground">0,5</strong> e cada concluída como <strong className="font-medium text-foreground">1</strong>.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Contratos no tipo Software, Infraestrutura ou Serviço: {totalContracts} listado(s), {totalItems} item(ns) no total.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhum contrato destes tipos. Os módulos aplicam-se a contratos Software, Infraestrutura ou Serviço.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((contract) => {
            const isOpen = openContractIds.has(contract.id);
            const itemsN = countItems(contract.modules);
            const nNot = countByDelivery(contract.modules, "NOT_DELIVERED");
            const nPart = countByDelivery(contract.modules, "PARTIALLY_DELIVERED");
            const nOk = countByDelivery(contract.modules, "DELIVERED");
            const prop = contract.featureImplantationProportion;
            const panelId = `modulos-contrato-${contract.id}`;
            return (
              <section
                key={contract.id}
                className={cn(
                  "overflow-hidden rounded-xl border bg-card shadow-sm transition-[box-shadow] duration-200",
                  isOpen && "ring-1 ring-border/80"
                )}
              >
                <button
                  type="button"
                  id={`${panelId}-trigger`}
                  className="flex w-full flex-col gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 sm:flex-row sm:items-center"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => toggleContract(contract.id)}
                >
                  <div className="flex w-full min-w-0 items-start gap-3 sm:flex-1">
                    <ChevronDown
                      className={cn("mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-out", isOpen && "rotate-180")}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{contract.number}</span>
                        <span className="truncate font-medium text-foreground">{contract.name}</span>
                        <Badge variant="secondary" className="text-[10px] font-normal">
                          {contractTypeLabel[contract.contractType] ?? contract.contractType}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {statusLabel[contract.status] ?? contract.status}
                        </Badge>
                      </div>
                      {itemsN > 0 ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          <span className="tabular-nums font-medium text-foreground">{itemsN}</span> itens ·{" "}
                          <span className={itemDeliveryLabelClass("DELIVERED")}>{nOk} entregues</span>
                          {" · "}
                          <span className={itemDeliveryLabelClass("PARTIALLY_DELIVERED")}>{nPart} parciais</span>
                          {" · "}
                          <span className={itemDeliveryLabelClass("NOT_DELIVERED")}>{nNot} não entregues</span>
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">Sem módulos ou itens — configure na página do contrato.</p>
                      )}
                      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          Gestor: <strong className="font-medium text-foreground">{contract.manager?.name ?? "Não informado"}</strong>
                        </span>
                        <span>
                          Fiscal: <strong className="font-medium text-foreground">{contract.fiscal?.name ?? "Não informado"}</strong>
                        </span>
                      </p>
                      {prop?.applicable && prop.proportionalMonthlyValue && prop.ratioImplantedPercent ? (
                        <p className="mt-1 text-xs font-medium text-sky-900 dark:text-sky-200">
                          Proporcional ao valor mensal: {prop.ratioImplantedPercent}% → {formatBrl(prop.proportionalMonthlyValue)} (contrato{" "}
                          {formatBrl(prop.contractMonthlyValue)}/mês)
                        </p>
                      ) : prop?.explanation ? (
                        <p className="mt-1 text-xs text-muted-foreground">{prop.explanation}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex w-full shrink-0 items-center justify-between gap-3 sm:w-auto sm:justify-end">
                    <DeliveryMiniChart total={itemsN} delivered={nOk} partial={nPart} notDelivered={nNot} />
                    <Link
                      href={`/contracts/${contract.id}` as Route}
                      className="shrink-0 text-xs font-medium text-primary underline-offset-4 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Abrir contrato
                    </Link>
                  </div>
                </button>

                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={`${panelId}-trigger`}
                  className={cn(
                    "grid min-h-0 transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none",
                    isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr] pointer-events-none"
                  )}
                >
                  <div className="min-h-0 overflow-hidden">
                    <div className="space-y-4 border-t border-border/60 px-4 pb-4 pt-3" {...(!isOpen ? ({ inert: true, "aria-hidden": true } as const) : {})}>
                      {contract.modules.length === 0 ? null : (
                        <>
                          {contract.modules.map((mod) => {
                            const modKey = modulePanelKey(contract.id, mod.id);
                            const modPanelId = `modulos-mod-${contract.id}-${mod.id}`;
                            const isModOpen = !collapsedModuleKeys.has(modKey);
                            const mItems = mod.features.length;
                            const mOk = countByDeliveryInModule(mod, "DELIVERED");
                            const mPart = countByDeliveryInModule(mod, "PARTIALLY_DELIVERED");
                            const mNot = countByDeliveryInModule(mod, "NOT_DELIVERED");
                            return (
                              <div
                                key={mod.id}
                                className={cn(
                                  "overflow-hidden rounded-lg border border-border/50 bg-muted/20 transition-[box-shadow] duration-200",
                                  isModOpen && "ring-1 ring-border/60"
                                )}
                              >
                                <button
                                  type="button"
                                  id={`${modPanelId}-trigger`}
                                  className="flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
                                  aria-expanded={isModOpen}
                                  aria-controls={modPanelId}
                                  onClick={() => toggleModule(contract.id, mod.id)}
                                >
                                  <ChevronDown
                                    className={cn(
                                      "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-out",
                                      isModOpen && "rotate-180"
                                    )}
                                    aria-hidden
                                  />
                                  <div className="min-w-0 flex-1">
                                    <h3 className="text-sm font-semibold text-foreground">
                                      {mod.name}
                                      <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                                        peso {serializeWeight(mod.weight)}
                                      </span>
                                    </h3>
                                    {mItems > 0 ? (
                                      <p className="mt-1 text-xs text-muted-foreground">
                                        <span className="tabular-nums font-medium text-foreground">{mItems}</span> itens ·{" "}
                                        <span className={itemDeliveryLabelClass("DELIVERED")}>{mOk} entregues</span>
                                        {" · "}
                                        <span className={itemDeliveryLabelClass("PARTIALLY_DELIVERED")}>{mPart} parciais</span>
                                        {" · "}
                                        <span className={itemDeliveryLabelClass("NOT_DELIVERED")}>{mNot} não entregues</span>
                                      </p>
                                    ) : (
                                      <p className="mt-1 text-xs text-muted-foreground">Sem funcionalidades neste módulo.</p>
                                    )}
                                  </div>
                                </button>

                                <div
                                  id={modPanelId}
                                  role="region"
                                  aria-labelledby={`${modPanelId}-trigger`}
                                  className={cn(
                                    "grid min-h-0 transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none",
                                    isModOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr] pointer-events-none"
                                  )}
                                >
                                  <div className="min-h-0 overflow-hidden">
                                    <div
                                      className="border-t border-border/40 px-3 pb-3 pt-2"
                                      {...(!isModOpen ? ({ inert: true, "aria-hidden": true } as const) : {})}
                                    >
                                      {mod.features.length === 0 ? (
                                        <p className="text-xs text-muted-foreground">Nenhum item neste módulo.</p>
                                      ) : (
                                        <ul className="space-y-2">
                                          {mod.features.map((item) => {
                                            const ds = (item.deliveryStatus ?? "NOT_DELIVERED") as ContractItemDeliveryStatus;
                                            const criticality = (item.criticality ?? "MEDIA") as ContractItemCriticality;
                                            const rowBusy = busyRowKey === rowKey(contract.id, mod.id, item.id);
                                            return (
                                              <li
                                                key={item.id}
                                                className="flex flex-col gap-3 rounded-md border border-border/40 bg-background/80 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3"
                                              >
                                                <div className="min-w-0 flex-1">
                                                  <p className="text-sm font-medium text-foreground">
                                                    {item.itemCode ? (
                                                      <span className="mr-2 font-mono text-xs text-muted-foreground">{item.itemCode}</span>
                                                    ) : null}
                                                    {item.name}
                                                  </p>
                                                  <p className="text-[11px] text-muted-foreground">
                                                    Peso {serializeWeight(item.weight)}
                                                  </p>
                                                </div>
                                                <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:max-w-[35rem] sm:flex-row sm:items-center sm:justify-end sm:gap-2">
                                                  <div className="min-w-0 flex-1 sm:min-w-[10.5rem] sm:flex-1 sm:max-w-[12rem]">
                                                    <Select
                                                      value={criticality}
                                                      disabled={rowBusy}
                                                      onValueChange={(v) => {
                                                        updateCriticalityMut.mutate({
                                                          contractId: contract.id,
                                                          moduleId: mod.id,
                                                          featureId: item.id,
                                                          criticality: v as ContractItemCriticality
                                                        });
                                                      }}
                                                    >
                                                      <SelectTrigger
                                                        className={cn("h-9 w-full text-left text-xs", criticalitySelectTriggerClass(criticality))}
                                                        aria-label={`Criticidade da funcionalidade: ${item.name}`}
                                                      >
                                                        <SelectValue placeholder="Criticidade" />
                                                      </SelectTrigger>
                                                      <SelectContent>
                                                        {criticalityOptions.map((opt) => (
                                                          <SelectItem
                                                            key={opt}
                                                            value={opt}
                                                            className={cn("text-xs", criticalitySelectItemClass(opt))}
                                                          >
                                                            {criticalityLabels[opt]}
                                                          </SelectItem>
                                                        ))}
                                                      </SelectContent>
                                                    </Select>
                                                  </div>
                                                  <div className="min-w-0 flex-1 sm:min-w-[12rem] sm:flex-1 sm:max-w-[14.5rem]">
                                                    <Select
                                                      value={ds}
                                                      disabled={rowBusy}
                                                      onValueChange={(v) => {
                                                        updateDeliveryMut.mutate({
                                                          contractId: contract.id,
                                                          moduleId: mod.id,
                                                          featureId: item.id,
                                                          deliveryStatus: v as ContractItemDeliveryStatus
                                                        });
                                                      }}
                                                    >
                                                      <SelectTrigger
                                                        className={cn("h-9 w-full text-left text-xs", itemDeliverySelectTriggerClass(ds))}
                                                        aria-label={`Estado de entrega: ${item.name}`}
                                                      >
                                                        <SelectValue placeholder="Estado" />
                                                      </SelectTrigger>
                                                      <SelectContent>
                                                        {deliveryOptions.map((opt) => (
                                                          <SelectItem
                                                            key={opt}
                                                            value={opt}
                                                            className={cn("text-xs", itemDeliverySelectItemClass(opt))}
                                                          >
                                                            {deliveryLabels[opt]}
                                                          </SelectItem>
                                                        ))}
                                                      </SelectContent>
                                                    </Select>
                                                  </div>
                                                  <div className="flex shrink-0 items-center justify-end gap-1.5 sm:justify-start">
                                                    <Button
                                                      type="button"
                                                      variant="outline"
                                                      size="icon"
                                                      className="h-9 w-9 shrink-0"
                                                      disabled={rowBusy}
                                                      title="Editar"
                                                      aria-label={`Editar funcionalidade ${item.name}`}
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        openEdit(contract.id, mod, item);
                                                      }}
                                                    >
                                                      <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                      type="button"
                                                      variant="outline"
                                                      size="icon"
                                                      className="h-9 w-9 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                                      disabled={rowBusy}
                                                      title="Excluir"
                                                      aria-label={`Excluir funcionalidade ${item.name}`}
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        tryDeleteFeature(contract.id, mod, item);
                                                      }}
                                                    >
                                                      <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                  </div>
                                                </div>
                                              </li>
                                            );
                                          })}
                                        </ul>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {mutationError ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
          {mutationError}
        </p>
      ) : null}

      <Modal
        open={editDraft !== null}
        onClose={() => {
          if (!saveFeatureMut.isPending) {
            setEditHint(null);
            setEditDraft(null);
          }
        }}
        title="Editar funcionalidade"
        description="Código do item, nome, criticidade, estado da funcionalidade e estado de entrega."
        contentClassName="max-w-md"
      >
        {editDraft ? (
          <div className="space-y-4 pt-1">
            <div className="space-y-2">
              <Label htmlFor="modulos-edit-codigo">Código do Item</Label>
              <Input
                id="modulos-edit-codigo"
                value={editDraft.itemCode}
                placeholder="Ex.: 1.2.3"
                disabled={saveFeatureMut.isPending}
                onChange={(e) => setEditDraft((d) => (d ? { ...d, itemCode: e.target.value } : d))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="modulos-edit-nome">Nome</Label>
              <Input
                id="modulos-edit-nome"
                value={editDraft.name}
                disabled={saveFeatureMut.isPending}
                onChange={(e) => setEditDraft((d) => (d ? { ...d, name: e.target.value } : d))}
              />
            </div>
            <div className="space-y-2">
              <Label>Criticidade</Label>
              <Select
                value={editDraft.criticality}
                disabled={saveFeatureMut.isPending}
                onValueChange={(v) =>
                  setEditDraft((d) => (d ? { ...d, criticality: v as ContractItemCriticality } : d))
                }
              >
                <SelectTrigger
                  className={cn("h-9 text-left text-xs", criticalitySelectTriggerClass(editDraft.criticality))}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {criticalityOptions.map((opt) => (
                    <SelectItem key={opt} value={opt} className={cn("text-xs", criticalitySelectItemClass(opt))}>
                      {criticalityLabels[opt]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Peso calculado atual: {editDraft.weightStr}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="modulos-edit-status">Estado da funcionalidade</Label>
              <select
                id="modulos-edit-status"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                value={editDraft.status}
                disabled={saveFeatureMut.isPending}
                onChange={(e) =>
                  setEditDraft((d) => (d ? { ...d, status: e.target.value as ContractFeatureStatus } : d))
                }
              >
                {featureStatuses.map((s) => (
                  <option key={s} value={s}>
                    {featureStatusLabels[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Estado de entrega</Label>
              <Select
                value={editDraft.deliveryStatus}
                disabled={saveFeatureMut.isPending}
                onValueChange={(v) =>
                  setEditDraft((d) =>
                    d ? { ...d, deliveryStatus: v as ContractItemDeliveryStatus } : d
                  )
                }
              >
                <SelectTrigger
                  className={cn("h-9 text-left text-xs", itemDeliverySelectTriggerClass(editDraft.deliveryStatus))}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {deliveryOptions.map((opt) => (
                    <SelectItem key={opt} value={opt} className={cn("text-xs", itemDeliverySelectItemClass(opt))}>
                      {deliveryLabels[opt]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editHint ? (
              <p className="text-sm text-destructive" role="alert">
                {editHint}
              </p>
            ) : null}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={saveFeatureMut.isPending}
                onClick={() => {
                  setEditHint(null);
                  setEditDraft(null);
                }}
              >
                Cancelar
              </Button>
              <Button type="button" disabled={saveFeatureMut.isPending} onClick={() => void submitEdit()}>
                {saveFeatureMut.isPending ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
