"use client";

import type { Route } from "next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type {
  ContractFeatureStatus,
  ContractItemCriticality,
  ContractItemDeliveryStatus,
  ContractModulesDeliveryModule,
  ContractModulesDeliveryOverview,
  FeatureAssignmentReason,
  ModulesDeliveryAssignmentFilter,
  ModulesDeliveryFeature,
  ModulesDeliveryTotals
} from "@/lib/api";
import {
  deleteContractFeature,
  getContractModulesDelivery,
  getModuleFeaturesDelivery,
  getModulesDeliveryOverview,
  searchModulesDeliveryFeatures,
  updateContractFeature
} from "@/lib/api";
import { formatBrl, formatPercent } from "@/lib/format-brl";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { orderFeaturesByItemCode } from "@/lib/item-code-order";
import { itemDeliveryLabelClass, itemDeliverySelectItemClass, itemDeliverySelectTriggerClass } from "@/lib/item-delivery-styles";
import { queryKeys } from "@/lib/query-keys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { FeatureDescriptionText } from "@/components/features/feature-description-text";
import { Textarea } from "@/components/ui/textarea";

const deliveryLabels: Record<ContractItemDeliveryStatus, string> = {
  NOT_DELIVERED: "Não entregue",
  PARTIALLY_DELIVERED: "Parcialmente entregue",
  DELIVERED: "Entregue"
};

const deliveryOptions: ContractItemDeliveryStatus[] = ["NOT_DELIVERED", "PARTIALLY_DELIVERED", "DELIVERED"];
const REQUIRED_ITEM_CODE_MESSAGE = "O campo obrigatório Código do Item deve ser preenchido antes de gravar a informação.";

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
  APOIO: "Apoio (1)",
  NAO_SE_APLICA: "Não se aplica"
};

const criticalityOptions: ContractItemCriticality[] = [
  "CRITICA",
  "ALTA",
  "MEDIA",
  "BAIXA",
  "APOIO",
  "NAO_SE_APLICA"
];

const FEATURES_PAGE_SIZE = 40;
const CHANGE_SOURCE = "MODULES_SIMPLIFIED";

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
    case "NAO_SE_APLICA":
      return `${ring} border-violet-200 bg-violet-50/80 text-violet-900 dark:border-violet-800/90 dark:bg-violet-950/40 dark:text-violet-200 dark:focus:ring-violet-700 focus:ring-violet-300`;
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
    case "NAO_SE_APLICA":
      return "text-violet-900 data-[highlighted]:bg-violet-100 data-[highlighted]:text-violet-950 focus:bg-violet-100 focus:text-violet-950 dark:text-violet-200 dark:data-[highlighted]:bg-violet-950/50 dark:data-[highlighted]:text-violet-50 dark:focus:bg-violet-950/50 dark:focus:text-violet-50";
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

function deliveryCompletionPercent(total: number, delivered: number, partial: number): number {
  if (total <= 0) return 0;
  return ((delivered + partial * 0.5) / total) * 100;
}

function DeliveryMiniChart({ total, delivered, partial, notDelivered }: { total: number; delivered: number; partial: number; notDelivered: number }): JSX.Element {
  const completion = deliveryCompletionPercent(total, delivered, partial);
  const completionLabel = formatPercent(completion, 2);
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
        <span className="font-semibold tabular-nums text-foreground">{completionLabel} cumprido</span>
        <span className={itemDeliveryLabelClass("DELIVERED")}>
          {delivered}/{total} requisito(s)
        </span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-label={`${completionLabel} dos requisitos cumpridos`}>
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

type UserRole = "ADMIN" | "EDITOR" | "VIEWER";

type Props = {
  initialRows: ContractModulesDeliveryOverview[];
  dataLoadErrors?: string[];
  userRole?: UserRole;
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

type DeliveryFilters = {
  deliveryStatus: "" | ContractItemDeliveryStatus;
  criticality: "" | ContractItemCriticality;
  assignment: ModulesDeliveryAssignmentFilter;
  query: string;
};

const assignmentFilterLabels: Record<Exclude<ModulesDeliveryAssignmentFilter, "">, string> = {
  ALL: "Todos",
  ASSIGNED_TO_ME: "Atribuídos a mim",
  GROUP_MEMBER: "Sou responsável pelo grupo",
  MODULE_FISCAL: "Sou responsável pelo módulo",
  NO_RESPONSIBLE: "Sem responsável"
};

function assignmentReasonBadges(reasons: FeatureAssignmentReason[] | undefined, groupUndefined?: boolean): JSX.Element | null {
  const list = [...(reasons ?? [])];
  if (groupUndefined && !list.includes("UNDEFINED_GROUP")) list.push("UNDEFINED_GROUP");
  if (list.length === 0) return null;
  const labels: Partial<Record<FeatureAssignmentReason, { text: string; className: string }>> = {
    GROUP: { text: "Grupo", className: "bg-violet-100 text-violet-900" },
    FEATURE: { text: "Específico", className: "bg-sky-100 text-sky-900" },
    MODULE: { text: "Módulo (acompanhamento)", className: "bg-slate-200 text-slate-800" },
    UNDEFINED_GROUP: { text: "Grupo não definido", className: "bg-amber-100 text-amber-900" },
    NONE: { text: "Sem responsável", className: "bg-rose-100 text-rose-900" }
  };
  return (
    <span className="flex flex-wrap gap-1">
      {list.map((reason) => {
        const meta = labels[reason];
        if (!meta) return null;
        return (
          <span key={reason} className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", meta.className)}>
            {meta.text}
          </span>
        );
      })}
    </span>
  );
}

type FeatureMutationContext = {
  busyRowKey: string | null;
  canEditFeature: boolean;
  canEditDelivery: boolean;
  canEditCriticality: boolean;
  searchQuery: string;
  openEdit: (contractId: string, moduleId: string, item: ModulesDeliveryFeature) => void;
  tryDeleteFeature: (contractId: string, moduleId: string, item: ModulesDeliveryFeature) => void;
  updateDelivery: (vars: {
    contractId: string;
    moduleId: string;
    featureId: string;
    deliveryStatus: ContractItemDeliveryStatus;
  }) => void;
  updateCriticality: (vars: {
    contractId: string;
    moduleId: string;
    featureId: string;
    criticality: ContractItemCriticality;
  }) => void;
};

function totalsFrom(t: ModulesDeliveryTotals | undefined): {
  total: number;
  delivered: number;
  partial: number;
  notDelivered: number;
} {
  return {
    total: t?.totalFeatures ?? 0,
    delivered: t?.deliveredCount ?? 0,
    partial: t?.partialCount ?? 0,
    notDelivered: t?.notDeliveredCount ?? 0
  };
}

function FeatureRow({
  contractId,
  moduleId,
  item,
  depth,
  ctx
}: {
  contractId: string;
  moduleId: string;
  item: ModulesDeliveryFeature;
  depth: number;
  ctx: FeatureMutationContext;
}): JSX.Element {
  const ds = (item.deliveryStatus ?? "NOT_DELIVERED") as ContractItemDeliveryStatus;
  const criticality = (item.criticality ?? "MEDIA") as ContractItemCriticality;
  const rowBusy = ctx.busyRowKey === rowKey(contractId, moduleId, item.id);
  return (
    <li
      className="flex flex-col gap-3 rounded-md border border-border/40 bg-background/80 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3"
      style={
        depth > 0
          ? { marginLeft: `${depth * 1.25}rem`, borderLeftWidth: "3px", borderLeftColor: "hsl(var(--border))" }
          : undefined
      }
    >
      <div className="min-w-0 flex-1 space-y-1">
        {item.itemCode ? (
          <p className="text-xs font-medium text-muted-foreground">{item.itemCode}</p>
        ) : null}
        <FeatureDescriptionText text={item.name} searchQuery={ctx.searchQuery} />
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] text-muted-foreground">Peso {serializeWeight(item.weight)}</p>
          {criticality === "NAO_SE_APLICA" ? (
            <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-medium text-violet-900 dark:bg-violet-950/50 dark:text-violet-200">
              Fora do cálculo
            </span>
          ) : null}
          {assignmentReasonBadges(item.assignmentReasons, item.groupUndefined)}
          {item.validationGroup?.name ? (
            <span className="text-[11px] text-muted-foreground">Grupo: {item.validationGroup.name}</span>
          ) : null}
        </div>
      </div>
      <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:max-w-[35rem] sm:flex-row sm:items-center sm:justify-end sm:gap-2">
        {ctx.canEditCriticality ? (
          <div className="min-w-0 flex-1 sm:min-w-[10.5rem] sm:flex-1 sm:max-w-[12rem]">
            <Select
              value={criticality}
              disabled={rowBusy}
              onValueChange={(v) => {
                ctx.updateCriticality({
                  contractId,
                  moduleId,
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
                  <SelectItem key={opt} value={opt} className={cn("text-xs", criticalitySelectItemClass(opt))}>
                    {criticalityLabels[opt]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {ctx.canEditDelivery ? (
          <div className="min-w-0 flex-1 sm:min-w-[12rem] sm:flex-1 sm:max-w-[14.5rem]">
            <Select
              value={ds}
              disabled={rowBusy}
              onValueChange={(v) => {
                ctx.updateDelivery({
                  contractId,
                  moduleId,
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
                  <SelectItem key={opt} value={opt} className={cn("text-xs", itemDeliverySelectItemClass(opt))}>
                    {deliveryLabels[opt]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {ctx.canEditFeature ? (
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
                ctx.openEdit(contractId, moduleId, item);
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
                ctx.tryDeleteFeature(contractId, moduleId, item);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function FeaturesList({
  contractId,
  moduleId,
  features,
  hasMore,
  loadingMore,
  onLoadMore,
  flatDepth,
  ctx
}: {
  contractId: string;
  moduleId: string;
  features: ModulesDeliveryFeature[];
  hasMore: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  flatDepth?: boolean;
  ctx: FeatureMutationContext;
}): JSX.Element {
  if (features.length === 0) {
    return <p className="text-xs text-muted-foreground">Nenhum item neste módulo.</p>;
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {orderFeaturesByItemCode(features, { flatDepth }).map(({ feature: item, depth }) => (
          <FeatureRow
            key={item.id}
            contractId={contractId}
            moduleId={moduleId}
            item={item}
            depth={depth}
            ctx={ctx}
          />
        ))}
      </ul>
      {hasMore && onLoadMore ? (
        <div className="pt-1">
          <Button type="button" variant="secondary" size="sm" disabled={loadingMore} onClick={() => onLoadMore()}>
            {loadingMore ? "Carregando…" : "Carregar mais"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ModuleFeaturesBrowsePanel({
  contractId,
  moduleId,
  enabled,
  ctx
}: {
  contractId: string;
  moduleId: string;
  enabled: boolean;
  ctx: FeatureMutationContext;
}): JSX.Element | null {
  const [extraFeatures, setExtraFeatures] = useState<ModulesDeliveryFeature[]>([]);
  const [nextPage, setNextPage] = useState(2);
  const [extraHasMore, setExtraHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const { data, isLoading, isError, error, dataUpdatedAt } = useQuery({
    queryKey: queryKeys.moduleFeaturesDelivery(contractId, moduleId),
    queryFn: () => getModuleFeaturesDelivery(contractId, moduleId, { page: 1, pageSize: FEATURES_PAGE_SIZE }),
    enabled
  });

  useEffect(() => {
    setExtraFeatures([]);
    setNextPage(2);
    setExtraHasMore(false);
  }, [dataUpdatedAt, contractId, moduleId]);

  const features = useMemo(() => {
    const first = data?.features ?? [];
    if (extraFeatures.length === 0) return first;
    const seen = new Set(first.map((f) => f.id));
    return [...first, ...extraFeatures.filter((f) => !seen.has(f.id))];
  }, [data?.features, extraFeatures]);

  const hasMore = extraFeatures.length === 0 ? Boolean(data?.hasMore) : extraHasMore;

  async function loadMore(): Promise<void> {
    setLoadingMore(true);
    try {
      const page = await getModuleFeaturesDelivery(contractId, moduleId, {
        page: nextPage,
        pageSize: FEATURES_PAGE_SIZE
      });
      setExtraFeatures((prev) => {
        const seen = new Set(prev.map((f) => f.id));
        return [...prev, ...page.features.filter((f) => !seen.has(f.id))];
      });
      setNextPage((p) => p + 1);
      setExtraHasMore(page.hasMore);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível carregar mais itens.");
    } finally {
      setLoadingMore(false);
    }
  }

  if (!enabled) {
    return null;
  }

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Carregando funcionalidades…</p>;
  }
  if (isError) {
    return (
      <p className="text-xs text-destructive" role="alert">
        {error instanceof Error ? error.message : "Erro ao carregar funcionalidades."}
      </p>
    );
  }

  return (
    <FeaturesList
      contractId={contractId}
      moduleId={moduleId}
      features={features}
      hasMore={hasMore}
      loadingMore={loadingMore}
      onLoadMore={() => void loadMore()}
      ctx={ctx}
    />
  );
}

function ModuleFeaturesSearchPanel({
  contractId,
  moduleId,
  initialFeatures,
  initialHasMore,
  filters,
  ctx
}: {
  contractId: string;
  moduleId: string;
  initialFeatures: ModulesDeliveryFeature[];
  initialHasMore: boolean;
  filters: { q?: string; deliveryStatus?: string; criticality?: string; assignment?: string };
  ctx: FeatureMutationContext;
}): JSX.Element {
  const [features, setFeatures] = useState(initialFeatures);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    setFeatures(initialFeatures);
    setPage(1);
    setHasMore(initialHasMore);
  }, [initialFeatures, initialHasMore, contractId, moduleId]);

  async function loadMore(): Promise<void> {
    setLoadingMore(true);
    try {
      const next = page + 1;
      const data = await getModuleFeaturesDelivery(contractId, moduleId, {
        page: next,
        pageSize: FEATURES_PAGE_SIZE,
        q: filters.q,
        deliveryStatus: filters.deliveryStatus,
        criticality: filters.criticality,
        assignment: filters.assignment
      });
      setFeatures((prev) => {
        const seen = new Set(prev.map((f) => f.id));
        return [...prev, ...data.features.filter((f) => !seen.has(f.id))];
      });
      setPage(next);
      setHasMore(data.hasMore);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível carregar mais itens.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <FeaturesList
      contractId={contractId}
      moduleId={moduleId}
      features={features}
      hasMore={hasMore}
      loadingMore={loadingMore}
      onLoadMore={() => void loadMore()}
      flatDepth
      ctx={ctx}
    />
  );
}

function ModuleAccordion({
  contractId,
  mod,
  forceOpen,
  searchFilters,
  ctx
}: {
  contractId: string;
  mod: ContractModulesDeliveryModule;
  /** Em modo pesquisa, módulos começam abertos com features da busca. */
  forceOpen?: boolean;
  searchFilters?: { q?: string; deliveryStatus?: string; criticality?: string; assignment?: string } | null;
  ctx: FeatureMutationContext;
}): JSX.Element {
  const [collapsed, setCollapsed] = useState(!forceOpen);

  useEffect(() => {
    setCollapsed(!forceOpen);
  }, [forceOpen, mod.id]);

  const isOpen = !collapsed;
  const modPanelId = `modulos-mod-${contractId}-${mod.id}`;
  const t = totalsFrom(mod.totals);
  const searchPage = mod.featuresPage;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border/50 bg-muted/20 transition-[box-shadow] duration-200",
        isOpen && "ring-1 ring-border/60"
      )}
    >
      <button
        type="button"
        id={`${modPanelId}-trigger`}
        className="flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
        aria-expanded={isOpen}
        aria-controls={modPanelId}
        onClick={() => setCollapsed((v) => !v)}
      >
        <ChevronDown
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-out",
            isOpen && "rotate-180"
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">
            {mod.name}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              peso {serializeWeight(mod.weight)}
            </span>
          </h3>
          {t.total > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="tabular-nums font-medium text-foreground">{t.total}</span> itens ·{" "}
              <span className={itemDeliveryLabelClass("DELIVERED")}>{t.delivered} entregues</span>
              {" · "}
              <span className={itemDeliveryLabelClass("PARTIALLY_DELIVERED")}>{t.partial} parciais</span>
              {" · "}
              <span className={itemDeliveryLabelClass("NOT_DELIVERED")}>{t.notDelivered} não entregues</span>
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">Sem funcionalidades neste módulo.</p>
          )}
          {mod.glosaPricingItem ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Base de glosa: #{mod.glosaPricingItem.sequence} · {mod.glosaPricingItem.description}
            </p>
          ) : null}
        </div>
      </button>

      <div
        id={modPanelId}
        role="region"
        aria-labelledby={`${modPanelId}-trigger`}
        className={cn(
          "grid min-h-0 transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr] pointer-events-none"
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            className="border-t border-border/40 px-3 pb-3 pt-2"
            {...(!isOpen ? ({ inert: true, "aria-hidden": true } as const) : {})}
          >
            {forceOpen && searchPage ? (
              isOpen ? (
                <ModuleFeaturesSearchPanel
                  contractId={contractId}
                  moduleId={mod.id}
                  initialFeatures={searchPage.features}
                  initialHasMore={searchPage.hasMore}
                  filters={searchFilters ?? {}}
                  ctx={ctx}
                />
              ) : null
            ) : (
              <ModuleFeaturesBrowsePanel
                contractId={contractId}
                moduleId={mod.id}
                enabled={isOpen && !forceOpen}
                ctx={ctx}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ContractModulesBrowseBody({
  contractId,
  enabled,
  ctx
}: {
  contractId: string;
  enabled: boolean;
  ctx: FeatureMutationContext;
}): JSX.Element {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.contractModulesDelivery(contractId),
    queryFn: () => getContractModulesDelivery(contractId),
    enabled
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando módulos…</p>;
  }
  if (isError) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {error instanceof Error ? error.message : "Erro ao carregar módulos."}
      </p>
    );
  }

  const modules = data?.modules ?? [];
  if (modules.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem módulos neste contrato.</p>;
  }

  return (
    <div className="space-y-4">
      {modules.map((mod) => (
        <ModuleAccordion key={mod.id} contractId={contractId} mod={mod} ctx={ctx} />
      ))}
    </div>
  );
}

function ContractSection({
  contract,
  isOpen,
  onToggle,
  searchMode,
  searchFilters,
  canOpenContract,
  ctx
}: {
  contract: ContractModulesDeliveryOverview;
  isOpen: boolean;
  onToggle: () => void;
  searchMode: boolean;
  searchFilters: { q?: string; deliveryStatus?: string; criticality?: string; assignment?: string } | null;
  canOpenContract: boolean;
  ctx: FeatureMutationContext;
}): JSX.Element {
  const t = totalsFrom(contract.totals);
  const prop = contract.featureImplantationProportion;
  const panelId = `modulos-contrato-${contract.id}`;
  const modules = contract.modules ?? [];

  return (
    <section
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
        onClick={onToggle}
      >
        <div className="flex w-full min-w-0 items-start gap-3 sm:flex-1">
          <ChevronDown
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-out",
              isOpen && "rotate-180"
            )}
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
            {t.total > 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                <span className="tabular-nums font-medium text-foreground">{t.total}</span> itens ·{" "}
                <span className={itemDeliveryLabelClass("DELIVERED")}>{t.delivered} entregues</span>
                {" · "}
                <span className={itemDeliveryLabelClass("PARTIALLY_DELIVERED")}>{t.partial} parciais</span>
                {" · "}
                <span className={itemDeliveryLabelClass("NOT_DELIVERED")}>{t.notDelivered} não entregues</span>
              </p>
            ) : (
              <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                Sem módulos ou itens: configure na página do contrato.
              </p>
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
                Proporcional ao valor mensal: {prop.ratioImplantedPercent}% → {formatBrl(prop.proportionalMonthlyValue)}{" "}
                (contrato {formatBrl(prop.contractMonthlyValue)}/mês)
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex w-full shrink-0 items-center justify-between gap-3 sm:w-auto sm:justify-end">
          <DeliveryMiniChart
            total={t.total}
            delivered={t.delivered}
            partial={t.partial}
            notDelivered={t.notDelivered}
          />
          {canOpenContract ? (
            <Link
              href={`/contracts/${contract.id}` as Route}
              className="shrink-0 text-xs font-medium text-primary underline-offset-4 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              Abrir contrato
            </Link>
          ) : null}
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
          <div
            className="space-y-4 border-t border-border/60 px-4 pb-4 pt-3"
            {...(!isOpen ? ({ inert: true, "aria-hidden": true } as const) : {})}
          >
            {searchMode ? (
              modules.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum módulo correspondente aos filtros.</p>
              ) : (
                modules.map((mod) => (
                  <ModuleAccordion
                    key={mod.id}
                    contractId={contract.id}
                    mod={mod}
                    forceOpen
                    searchFilters={searchFilters}
                    ctx={ctx}
                  />
                ))
              )
            ) : isOpen ? (
              <ContractModulesBrowseBody contractId={contract.id} enabled={isOpen} ctx={ctx} />
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

export function ModulesDeliveryView({ initialRows, dataLoadErrors = [] }: Props): JSX.Element {
  const qc = useQueryClient();
  const permissionsQuery = useMyPermissions();
  const permissionKeys = permissionsQuery.data?.keys ?? [];
  const canEditFeature = permissionKeys.includes("contracts.edit");
  const canEditDelivery = permissionKeys.includes("contracts.features.edit_delivery");
  const canEditCriticality = permissionKeys.includes("contracts.features.edit_criticality");
  const canOpenContract = permissionKeys.includes("contracts.view");

  const [openContractIds, setOpenContractIds] = useState<Set<string>>(() => new Set());
  const [editDraft, setEditDraft] = useState<EditFeatureDraft | null>(null);
  const [editHint, setEditHint] = useState<string | null>(null);
  const [filters, setFilters] = useState<DeliveryFilters>({
    deliveryStatus: "",
    criticality: "",
    assignment: "",
    query: ""
  });
  const debouncedQuery = useDebouncedValue(filters.query, 300);
  const assignmentParam =
    filters.assignment && filters.assignment !== "ALL" ? filters.assignment : undefined;

  const { data: rows = initialRows } = useQuery({
    queryKey: [...queryKeys.modulesDeliveryOverview, assignmentParam ?? "ALL"],
    queryFn: () => getModulesDeliveryOverview({ assignment: assignmentParam }),
    initialData: assignmentParam ? undefined : initialRows
  });

  const hasFilters = Boolean(
    filters.deliveryStatus || filters.criticality || filters.assignment || debouncedQuery.trim()
  );
  const searchKey = hasFilters
    ? JSON.stringify({
        q: debouncedQuery.trim() || undefined,
        deliveryStatus: filters.deliveryStatus || undefined,
        criticality: filters.criticality || undefined,
        assignment: assignmentParam
      })
    : "";

  const searchFilters = hasFilters
    ? {
        q: debouncedQuery.trim() || undefined,
        deliveryStatus: filters.deliveryStatus || undefined,
        criticality: filters.criticality || undefined,
        assignment: assignmentParam
      }
    : null;

  const searchQuery = useQuery({
    queryKey: queryKeys.modulesDeliverySearch(searchKey),
    queryFn: () =>
      searchModulesDeliveryFeatures({
        q: searchFilters?.q,
        deliveryStatus: searchFilters?.deliveryStatus,
        criticality: searchFilters?.criticality,
        assignment: searchFilters?.assignment,
        pageSize: FEATURES_PAGE_SIZE
      }),
    enabled: hasFilters
  });

  function invalidateFor(contractId: string, moduleId: string): void {
    void qc.invalidateQueries({ queryKey: queryKeys.modulesDeliveryOverview });
    void qc.invalidateQueries({ queryKey: queryKeys.contractModulesDelivery(contractId) });
    void qc.invalidateQueries({ queryKey: queryKeys.moduleFeaturesDelivery(contractId, moduleId) });
    void qc.invalidateQueries({ queryKey: queryKeys.modulesDeliverySearchRoot });
  }

  const updateDeliveryMut = useMutation({
    mutationFn: async (vars: {
      contractId: string;
      moduleId: string;
      featureId: string;
      deliveryStatus: ContractItemDeliveryStatus;
    }) => {
      await updateContractFeature(vars.contractId, vars.moduleId, vars.featureId, {
        deliveryStatus: vars.deliveryStatus,
        changeSource: CHANGE_SOURCE
      });
      return vars;
    },
    onSuccess: (vars) => invalidateFor(vars.contractId, vars.moduleId)
  });

  const updateCriticalityMut = useMutation({
    mutationFn: async (vars: {
      contractId: string;
      moduleId: string;
      featureId: string;
      criticality: ContractItemCriticality;
    }) => {
      await updateContractFeature(vars.contractId, vars.moduleId, vars.featureId, {
        criticality: vars.criticality,
        changeSource: CHANGE_SOURCE
      });
      return vars;
    },
    onSuccess: (vars) => invalidateFor(vars.contractId, vars.moduleId)
  });

  const deleteFeatureMut = useMutation({
    mutationFn: async (vars: { contractId: string; moduleId: string; featureId: string }) => {
      await deleteContractFeature(vars.contractId, vars.moduleId, vars.featureId);
      return vars;
    },
    onSuccess: (vars) => invalidateFor(vars.contractId, vars.moduleId)
  });

  const saveFeatureMut = useMutation({
    mutationFn: async (vars: {
      contractId: string;
      moduleId: string;
      featureId: string;
      itemCode?: string | null;
      name: string;
      criticality?: ContractItemCriticality;
      status: ContractFeatureStatus;
      deliveryStatus?: ContractItemDeliveryStatus;
    }) => {
      await updateContractFeature(vars.contractId, vars.moduleId, vars.featureId, {
        itemCode: vars.itemCode,
        name: vars.name,
        status: vars.status,
        ...(vars.criticality ? { criticality: vars.criticality } : {}),
        ...(vars.deliveryStatus ? { deliveryStatus: vars.deliveryStatus } : {}),
        changeSource: CHANGE_SOURCE
      });
      return vars;
    },
    onSuccess: (vars) => {
      invalidateFor(vars.contractId, vars.moduleId);
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
            ? rowKey(
                saveFeatureMut.variables.contractId,
                saveFeatureMut.variables.moduleId,
                saveFeatureMut.variables.featureId
              )
            : null;

  const ctx: FeatureMutationContext = {
    busyRowKey,
    canEditFeature,
    canEditDelivery,
    canEditCriticality,
    searchQuery: filters.query,
    openEdit: (contractId, moduleId, item) => {
      setEditHint(null);
      setEditDraft({
        contractId,
        moduleId,
        featureId: item.id,
        itemCode: item.itemCode ?? "",
        name: item.name,
        weightStr: serializeWeight(item.weight),
        criticality: item.criticality ?? "MEDIA",
        status: (item.status as ContractFeatureStatus) ?? "NOT_STARTED",
        deliveryStatus: (item.deliveryStatus ?? "NOT_DELIVERED") as ContractItemDeliveryStatus
      });
    },
    tryDeleteFeature: (contractId, moduleId, item) => {
      if (!window.confirm(`Remover a funcionalidade «${item.name}»?`)) return;
      deleteFeatureMut.mutate({ contractId, moduleId, featureId: item.id });
    },
    updateDelivery: (vars) => updateDeliveryMut.mutate(vars),
    updateCriticality: (vars) => updateCriticalityMut.mutate(vars)
  };

  const toggleContract = (id: string): void => {
    setOpenContractIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalContracts = rows.length;
  const totalItems = useMemo(
    () => rows.reduce((s, r) => s + (r.totals?.totalFeatures ?? 0), 0),
    [rows]
  );

  const visibleRows = hasFilters ? (searchQuery.data?.contracts ?? []) : rows;
  const visibleItems = hasFilters
    ? (searchQuery.data?.totalFeatures ?? 0)
    : totalItems;

  function submitEdit(): void {
    if (!editDraft) return;
    setEditHint(null);
    const itemCode = editDraft.itemCode.trim();
    if (!itemCode) {
      setEditHint(REQUIRED_ITEM_CODE_MESSAGE);
      toast.error(REQUIRED_ITEM_CODE_MESSAGE);
      return;
    }
    const name = editDraft.name.trim();
    if (!name) {
      setEditHint("Indique um nome.");
      return;
    }
    saveFeatureMut.mutate({
      contractId: editDraft.contractId,
      moduleId: editDraft.moduleId,
      featureId: editDraft.featureId,
      itemCode,
      name,
      status: editDraft.status,
      ...(canEditCriticality ? { criticality: editDraft.criticality } : {}),
      ...(canEditDelivery ? { deliveryStatus: editDraft.deliveryStatus } : {})
    });
  }

  const mutationError =
    (updateDeliveryMut.error instanceof Error ? updateDeliveryMut.error.message : null) ??
    (updateCriticalityMut.error instanceof Error ? updateCriticalityMut.error.message : null) ??
    (deleteFeatureMut.error instanceof Error ? deleteFeatureMut.error.message : null) ??
    (saveFeatureMut.error instanceof Error ? saveFeatureMut.error.message : null);

  const queryPending = filters.query.trim() !== debouncedQuery.trim();
  const uiHasFilters = Boolean(
    filters.deliveryStatus || filters.criticality || filters.assignment || filters.query.trim()
  );

  return (
    <div className="space-y-6">
      {dataLoadErrors.length > 0 ? <DataLoadAlert messages={dataLoadErrors} /> : null}

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Funcionalidades</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Por contrato: <strong className="font-medium text-foreground">contratos</strong> e{" "}
          <strong className="font-medium text-foreground">módulos</strong> em sanfona (fechados por padrão; contagem por
          estado de entrega no cabeçalho de cada módulo) e respectivas{" "}
          <strong className="font-medium text-foreground">funcionalidades</strong> (itens de entrega). Cada funcionalidade
          registra se a entrega está <strong className="font-medium text-foreground">não feita</strong>,{" "}
          <strong className="font-medium text-foreground">parcial</strong> ou{" "}
          <strong className="font-medium text-foreground">concluída</strong>, para acompanhar se o contrato está sendo
          prestado. A criticidade também pode ser ajustada na linha, em escala colorida de{" "}
          <strong className="font-medium text-emerald-700 dark:text-emerald-300">apoio (1)</strong> a{" "}
          <strong className="font-medium text-rose-700 dark:text-rose-300">crítica (5)</strong>. No indicador proporcional
          ao valor mensal, cada parcial conta como <strong className="font-medium text-foreground">0,5</strong> e cada
          concluída como <strong className="font-medium text-foreground">1</strong>.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Contratos no tipo Software, Infraestrutura ou Serviço: {totalContracts} listado(s), {totalItems} item(ns) no
          total.
        </p>
      </div>

      <div className="rounded-xl border bg-card px-4 py-3 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.3fr_1fr_1fr_1fr_auto] xl:items-end">
          <Label className="space-y-1.5 text-xs font-medium">
            <span>Pesquisar por código ou descrição</span>
            <Input
              value={filters.query}
              onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
              placeholder="Ex.: 33.1, legado, processo físico..."
            />
          </Label>
          <Label className="space-y-1.5 text-xs font-medium">
            <span>Status de entrega</span>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
              value={filters.deliveryStatus}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  deliveryStatus: event.target.value as DeliveryFilters["deliveryStatus"]
                }))
              }
            >
              <option value="">Todos os status</option>
              {deliveryOptions.map((status) => (
                <option key={status} value={status}>
                  {deliveryLabels[status]}
                </option>
              ))}
            </select>
          </Label>
          <Label className="space-y-1.5 text-xs font-medium">
            <span>Criticidade</span>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
              value={filters.criticality}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  criticality: event.target.value as DeliveryFilters["criticality"]
                }))
              }
            >
              <option value="">Todas as criticidades</option>
              {criticalityOptions.map((criticality) => (
                <option key={criticality} value={criticality}>
                  {criticalityLabels[criticality]}
                </option>
              ))}
            </select>
          </Label>
          <Label className="space-y-1.5 text-xs font-medium">
            <span>Atribuição</span>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
              value={filters.assignment}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  assignment: event.target.value as DeliveryFilters["assignment"]
                }))
              }
            >
              <option value="">Todos</option>
              {(Object.keys(assignmentFilterLabels) as Array<keyof typeof assignmentFilterLabels>)
                .filter((k) => k !== "ALL")
                .map((key) => (
                  <option key={key} value={key}>
                    {assignmentFilterLabels[key]}
                  </option>
                ))}
            </select>
          </Label>
          <Button
            type="button"
            variant="secondary"
            disabled={!uiHasFilters}
            onClick={() => setFilters({ deliveryStatus: "", criticality: "", assignment: "", query: "" })}
          >
            Limpar filtros
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {uiHasFilters
            ? queryPending || searchQuery.isFetching
              ? "Pesquisando funcionalidades no servidor…"
              : `Exibindo ${visibleItems} funcionalidade(s) correspondente(s) aos filtros (pesquisa no servidor).`
            : "Use os filtros para priorizar itens por entrega, criticidade, atribuição ou localizar pelo código e descrição. Expanda um contrato para carregar os módulos sob demanda."}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhum contrato destes tipos. Os módulos aplicam-se a contratos Software, Infraestrutura ou Serviço.
        </p>
      ) : hasFilters && (searchQuery.isLoading || queryPending) ? (
        <p className="rounded-lg border border-dashed bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          Pesquisando…
        </p>
      ) : hasFilters && searchQuery.isError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-8 text-center text-sm text-destructive">
          {searchQuery.error instanceof Error
            ? searchQuery.error.message
            : "Não foi possível aplicar a pesquisa."}
        </p>
      ) : visibleRows.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          {hasFilters
            ? "Nenhuma funcionalidade encontrada para os filtros aplicados."
            : "Nenhum contrato para exibir."}
        </p>
      ) : (
        <div className="space-y-2">
          {visibleRows.map((contract) => {
            const isOpen = hasFilters ? true : openContractIds.has(contract.id);
            return (
              <ContractSection
                key={contract.id}
                contract={contract}
                isOpen={isOpen}
                onToggle={() => {
                  if (hasFilters) return;
                  toggleContract(contract.id);
                }}
                searchMode={hasFilters}
                searchFilters={searchFilters}
                canOpenContract={canOpenContract}
                ctx={ctx}
              />
            );
          })}
        </div>
      )}

      {searchQuery.data?.truncated ? (
        <p className="text-xs text-amber-800 dark:text-amber-300">
          A pesquisa retornou muitos resultados e pode estar truncada. Refine os filtros para ver todos os itens.
        </p>
      ) : null}

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
              <Label htmlFor="modulos-edit-codigo">
                Código do Item <span className="text-destructive">*</span>
              </Label>
              <Input
                id="modulos-edit-codigo"
                value={editDraft.itemCode}
                placeholder="Ex.: 1.2.3"
                disabled={saveFeatureMut.isPending}
                aria-invalid={editHint === REQUIRED_ITEM_CODE_MESSAGE}
                className={cn(editHint === REQUIRED_ITEM_CODE_MESSAGE && "border-destructive focus-visible:ring-destructive")}
                onChange={(e) => {
                  setEditDraft((d) => (d ? { ...d, itemCode: e.target.value } : d));
                  if (e.target.value.trim() && editHint === REQUIRED_ITEM_CODE_MESSAGE) setEditHint(null);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="modulos-edit-nome">Descrição da funcionalidade</Label>
              <Textarea
                id="modulos-edit-nome"
                value={editDraft.name}
                disabled={saveFeatureMut.isPending}
                rows={4}
                className="min-h-[6rem] max-h-[20rem] resize-y"
                onChange={(e) => setEditDraft((d) => (d ? { ...d, name: e.target.value } : d))}
              />
            </div>
            {canEditCriticality ? (
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
            ) : null}
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
            {canEditDelivery ? (
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
            ) : null}
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
