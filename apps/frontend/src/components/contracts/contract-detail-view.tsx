"use client";

import type { Route } from "next";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { prefetchContractFormCatalogs } from "@/modules/contracts/prefetch-contract-form-catalogs";
import { formatGlpiGroupsSummary } from "@/components/contracts/contract-glpi-groups-field";
import { ContractDeleteButton } from "@/components/contracts/contract-delete-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBrl } from "@/lib/format-brl";
import type { Contract } from "@/lib/api";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import {
  CONTRACT_DETAIL_TABS,
  resolveContractDetailTab,
  tabAllowed,
  type ContractDetailTabId
} from "@/modules/contracts/contract-detail-tabs";
import { contractStatusLabel } from "@/modules/contracts/contract-status";

const panelFallback = (
  <p className="py-8 text-center text-sm text-muted-foreground">Carregando painel…</p>
);

const ContractFormModal = dynamic(
  () =>
    import("@/components/contracts/contract-form-modal").then((m) => ({ default: m.ContractFormModal })),
  { ssr: false }
);
const ContractPricingItemsPanel = dynamic(
  () =>
    import("@/components/contracts/contract-pricing-items-panel").then((m) => ({
      default: m.ContractPricingItemsPanel
    })),
  { loading: () => panelFallback }
);
const ContractImplantationProportionPanel = dynamic(
  () =>
    import("@/components/contracts/contract-implantation-proportion-panel").then((m) => ({
      default: m.ContractImplantationProportionPanel
    })),
  { loading: () => panelFallback }
);
const ContractAmendmentsPanel = dynamic(
  () =>
    import("@/components/contracts/contract-amendments-panel").then((m) => ({
      default: m.ContractAmendmentsPanel
    })),
  { loading: () => panelFallback }
);
const ContractOccurrencesPanel = dynamic(
  () =>
    import("@/components/contracts/contract-occurrences-panel").then((m) => ({
      default: m.ContractOccurrencesPanel
    })),
  { loading: () => panelFallback }
);
const ContractConsumptionsPanel = dynamic(
  () =>
    import("@/components/contracts/contract-consumptions-panel").then((m) => ({
      default: m.ContractConsumptionsPanel
    })),
  { loading: () => panelFallback }
);
const ContractFilesPanel = dynamic(
  () =>
    import("@/components/contracts/contract-files-panel").then((m) => ({
      default: m.ContractFilesPanel
    })),
  { loading: () => panelFallback }
);
const ContractGlpiTicketsPanel = dynamic(
  () =>
    import("@/components/contracts/contract-glpi-tickets-panel").then((m) => ({
      default: m.ContractGlpiTicketsPanel
    })),
  { loading: () => panelFallback }
);
const ContractSchedulesPanel = dynamic(
  () =>
    import("@/components/contracts/contract-schedules-panel").then((m) => ({
      default: m.ContractSchedulesPanel
    })),
  { loading: () => panelFallback }
);
const ContractNotificationsPanel = dynamic(
  () =>
    import("@/components/contracts/contract-notifications-panel").then((m) => ({
      default: m.ContractNotificationsPanel
    })),
  { loading: () => panelFallback }
);
const ContractValidationGroupsPanel = dynamic(
  () =>
    import("@/components/contracts/contract-validation-groups-panel").then((m) => ({
      default: m.ContractValidationGroupsPanel
    })),
  { loading: () => panelFallback }
);
const ContractStructureEditor = dynamic(
  () =>
    import("@/components/contracts/contract-structure-editor").then((m) => ({
      default: m.ContractStructureEditor
    })),
  { loading: () => panelFallback }
);
const ContractItemChangeHistoryPanel = dynamic(
  () =>
    import("@/components/contracts/contract-item-change-history-panel").then((m) => ({
      default: m.ContractItemChangeHistoryPanel
    })),
  { loading: () => panelFallback }
);

export type ContractDetailLabels = {
  formalDisplay: string;
  orgLabel: string;
  tipoLabel: string;
  hiringLabel: string | null;
  lawLabel: string;
  cnpj: string;
};

type Props = {
  contract: Contract;
  labels: ContractDetailLabels;
  initialTab?: string | null;
};

function formatSlaTarget(raw: string | null | undefined): string {
  if (raw === null || raw === undefined || raw === "") return "-";
  const n = Number(String(raw).replace(",", "."));
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

function formatDatePt(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-BR");
}

export function ContractDetailView({ contract, labels, initialTab }: Props): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const qPerms = useMyPermissions();
  const permissionKeys = qPerms.data?.keys ?? null;
  const canEditContract = Boolean(permissionKeys?.includes("contracts.edit"));
  const canViewFinancial =
    !permissionKeys ||
    permissionKeys.includes("contracts.financial.view") ||
    permissionKeys.includes("contracts.view");
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    if (!canEditContract) return;
    const t = globalThis.setTimeout(() => prefetchContractFormCatalogs(qc), 500);
    return () => globalThis.clearTimeout(t);
  }, [canEditContract, qc]);

  const visibleTabs = useMemo(
    () => CONTRACT_DETAIL_TABS.filter((t) => tabAllowed(t, permissionKeys)),
    [permissionKeys]
  );

  const urlTab = searchParams.get("tab") ?? initialTab ?? null;
  const activeTab = resolveContractDetailTab(urlTab, permissionKeys);

  const [mountedTabs, setMountedTabs] = useState<Set<ContractDetailTabId>>(
    () => new Set<ContractDetailTabId>([resolveContractDetailTab(initialTab, null)])
  );

  useEffect(() => {
    setMountedTabs((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  const setTab = useCallback(
    (tab: string) => {
      const def = CONTRACT_DETAIL_TABS.find((t) => t.id === tab) ?? CONTRACT_DETAIL_TABS[0];
      if (!tabAllowed(def, permissionKeys)) {
        return;
      }
      setMountedTabs((prev) => {
        if (prev.has(def.id)) return prev;
        const next = new Set(prev);
        next.add(def.id);
        return next;
      });
      const sp = new URLSearchParams(searchParams.toString());
      if (tab === "dados") {
        sp.delete("tab");
      } else {
        sp.set("tab", tab);
      }
      const qs = sp.toString();
      router.replace((qs ? `${pathname}?${qs}` : pathname) as Route, { scroll: false });
    },
    [pathname, permissionKeys, router, searchParams]
  );

  useEffect(() => {
    if (qPerms.isPending) return;
    if (urlTab && urlTab !== activeTab) {
      setTab(activeTab);
    }
  }, [qPerms.isPending, urlTab, activeTab, setTab]);

  const glpiGroups = contract.glpiGroups ?? [];
  const glpiGroupsSummary = formatGlpiGroupsSummary(glpiGroups, 3);
  const [glpiExpanded, setGlpiExpanded] = useState(false);

  const globalOriginal = contract.globalValueOriginal;
  const globalCurrent = contract.globalValueCurrent;
  const globalAdjustmentDifference =
    contract.globalValueManual && contract.pricingTotals && globalCurrent != null
      ? Number(globalCurrent) - contract.pricingTotals.globalEstimated
      : null;

  const vigencyLabel = `${formatDatePt(contract.startDate)} a ${formatDatePt(contract.endDate)}`;
  const supplierLabel = contract.supplier?.name ?? contract.companyName ?? "-";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link
          href={"/contracts" as Route}
          className="font-medium text-slate-700 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900"
        >
          ← Voltar aos contratos
        </Link>
        <span className="text-slate-300" aria-hidden>
          |
        </span>
        <Link
          href={`/measurements?contractId=${contract.id}` as Route}
          className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900"
        >
          Medições deste contrato
        </Link>
      </div>

      {editOpen ? (
        <ContractFormModal
          open={editOpen}
          contract={contract}
          onClose={() => setEditOpen(false)}
          onSuccess={() => {
            router.refresh();
          }}
        />
      ) : null}

      <Card className="sticky top-[var(--app-header-height,3.75rem)] z-20 border-slate-200/90 bg-card/95 p-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/90 sm:p-4 md:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-slate-900 sm:text-lg md:text-xl">
              {contract.internalCode ? (
                <span className="mr-2 font-mono text-sm text-slate-700 sm:text-base">{contract.internalCode}</span>
              ) : null}
              {contract.name}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Número formal: <strong className="font-medium text-slate-800">{labels.formalDisplay}</strong>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-800">
              {contractStatusLabel(contract.status)}
            </span>
            {canEditContract ? (
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5" aria-hidden />
                Editar
              </Button>
            ) : null}
            <ContractDeleteButton
              contractId={contract.id}
              contractNumber={contract.number}
              contractName={contract.name}
            />
          </div>
        </div>
        <dl className="mt-3 hidden gap-2 text-sm text-slate-700 sm:grid sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Órgão gestor</dt>
            <dd className="mt-0.5 truncate">{labels.orgLabel}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fornecedor</dt>
            <dd className="mt-0.5 truncate">{supplierLabel}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vigência</dt>
            <dd className="mt-0.5 truncate">{vigencyLabel}</dd>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Grupos GLPI</dt>
            <dd className="mt-0.5 break-words" title={glpiGroupsSummary.full}>
              {glpiGroups.length === 0 ? (
                "-"
              ) : glpiExpanded || glpiGroupsSummary.hiddenCount === 0 ? (
                <>
                  {glpiGroupsSummary.full}
                  {glpiGroupsSummary.hiddenCount > 0 ? (
                    <>
                      {" "}
                      <button
                        type="button"
                        className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                        onClick={() => setGlpiExpanded(false)}
                      >
                        Recolher
                      </button>
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  {glpiGroups
                    .slice(0, 3)
                    .map((g) => g.glpiGroupName?.trim() || `Grupo #${g.glpiGroupId}`)
                    .join(", ")}{" "}
                  <button
                    type="button"
                    className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                    title={glpiGroupsSummary.full}
                    onClick={() => setGlpiExpanded(true)}
                  >
                    +{glpiGroupsSummary.hiddenCount} grupo
                    {glpiGroupsSummary.hiddenCount === 1 ? "" : "s"}
                  </button>
                </>
              )}
            </dd>
          </div>
        </dl>
        <p className="mt-2 truncate text-xs text-slate-600 sm:hidden">
          {labels.orgLabel} · {supplierLabel} · {vigencyLabel}
        </p>
      </Card>

      <Tabs value={activeTab} onValueChange={setTab} className="space-y-3">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList className="inline-flex h-auto min-w-full w-max justify-start gap-1 rounded-lg bg-muted p-1 sm:min-w-0 sm:w-full sm:flex-wrap">
            {visibleTabs.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="shrink-0 px-3 py-1.5 text-xs sm:text-sm"
              >
                <span className="sm:hidden">{tab.shortLabel}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {visibleTabs.some((t) => t.id === "dados") ? (
          <TabsContent
            value="dados"
            forceMount={mountedTabs.has("dados") ? true : undefined}
            className="mt-0 space-y-4 focus-visible:ring-0 data-[state=inactive]:hidden"
          >
            {mountedTabs.has("dados") ? (
              <>
                <Card className="p-5">
                  <h2 className="text-base font-semibold text-slate-900">Identificação e dados gerais</h2>
                  {contract.description ? (
                    <p className="mt-2 text-sm text-slate-600">{contract.description}</p>
                  ) : null}
                  <div className="mt-4 grid gap-3 text-sm text-slate-700 md:grid-cols-2">
                    {contract.internalCode ? (
                      <p>
                        <strong className="text-slate-900">Código interno SIGTI:</strong> {contract.internalCode}
                      </p>
                    ) : null}
                    <p>
                      <strong className="text-slate-900">Número formal:</strong> {labels.formalDisplay}
                    </p>
                    {contract.administrativeProcess ? (
                      <p>
                        <strong className="text-slate-900">Processo administrativo:</strong>{" "}
                        {contract.administrativeProcess}
                      </p>
                    ) : null}
                    <p className="md:col-span-2">
                      <strong className="text-slate-900">Órgão gestor:</strong> {labels.orgLabel}
                    </p>
                    <p>
                      <strong className="text-slate-900">Tipo de contrato:</strong> {labels.tipoLabel}
                    </p>
                    {labels.hiringLabel ? (
                      <p>
                        <strong className="text-slate-900">Tipo de contratação:</strong> {labels.hiringLabel}
                      </p>
                    ) : null}
                    {contract.hiringProcedureNumber ? (
                      <p>
                        <strong className="text-slate-900">Procedimento licitatório:</strong>{" "}
                        {contract.hiringProcedureNumber}
                      </p>
                    ) : null}
                    <p>
                      <strong className="text-slate-900">Contratante (razão social):</strong> {contract.companyName}
                    </p>
                    {contract.supplier ? (
                      <p>
                        <strong className="text-slate-900">Empresa terceirizada:</strong> {contract.supplier.name}
                      </p>
                    ) : null}
                    <p>
                      <strong className="text-slate-900">CNPJ (contrato):</strong> {labels.cnpj}
                    </p>
                    <p>
                      <strong className="text-slate-900">Status:</strong>{" "}
                      {contractStatusLabel(contract.status)}
                    </p>
                    <p>
                      <strong className="text-slate-900">Legislação:</strong> {labels.lawLabel}
                    </p>
                    <p>
                      <strong className="text-slate-900">Vigência:</strong> {vigencyLabel}
                    </p>
                    {canViewFinancial ? (
                      <>
                        <p>
                          <strong className="text-slate-900">Mensalidade (equivalente):</strong>{" "}
                          {formatBrl(contract.monthlyValue)}
                        </p>
                        <p>
                          <strong className="text-slate-900">Valores únicos (impl./outros):</strong>{" "}
                          {formatBrl(contract.installationValue)}
                        </p>
                      </>
                    ) : null}
                    {contract.implementationPeriodStart || contract.implementationPeriodEnd ? (
                      <p>
                        <strong className="text-slate-900">Período de implantação:</strong>{" "}
                        {formatDatePt(contract.implementationPeriodStart)} a{" "}
                        {formatDatePt(contract.implementationPeriodEnd)}
                      </p>
                    ) : null}
                    {canViewFinancial ? (
                      <>
                        <p>
                          <strong className="text-slate-900">Valor total:</strong> {formatBrl(contract.totalValue)}
                        </p>
                        {globalOriginal ? (
                          <p>
                            <strong className="text-slate-900">Valor global original:</strong>{" "}
                            {formatBrl(globalOriginal)}
                          </p>
                        ) : null}
                        {globalCurrent ? (
                          <p>
                            <strong className="text-slate-900">Valor global vigente:</strong>{" "}
                            {formatBrl(globalCurrent)}
                            {contract.globalValueManual ? (
                              <span className="ml-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                                ajuste manual
                              </span>
                            ) : null}
                          </p>
                        ) : null}
                        {contract.globalValueManual ? (
                          <p className="md:col-span-2">
                            <strong className="text-slate-900">Justificativa do ajuste manual:</strong>{" "}
                            {contract.globalValueJustification ?? "-"}
                            {globalAdjustmentDifference != null && Number.isFinite(globalAdjustmentDifference) ? (
                              <> · Diferença para os itens: {formatBrl(globalAdjustmentDifference)}</>
                            ) : null}
                          </p>
                        ) : null}
                        {contract.pricingTotals ? (
                          <p className="md:col-span-2">
                            <strong className="text-slate-900">Resumo dos itens:</strong> Mensalidade equivalente{" "}
                            {formatBrl(contract.pricingTotals.monthlyValue)} · Recorrentes{" "}
                            {formatBrl(contract.pricingTotals.recurringPredicted)} · Únicos{" "}
                            {formatBrl(contract.pricingTotals.oneTime)} · Sob demanda{" "}
                            {formatBrl(contract.pricingTotals.onDemand)}
                          </p>
                        ) : null}
                      </>
                    ) : null}
                    <p>
                      <strong className="text-slate-900">Meta de SLA (referência):</strong>{" "}
                      {formatSlaTarget(contract.slaTarget ?? undefined)}
                    </p>
                  </div>

                  <div className="mt-6 grid gap-4 border-t border-slate-100 pt-4 md:grid-cols-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fiscal</p>
                      <p className="mt-1 text-sm text-slate-800">{contract.fiscal?.name ?? "-"}</p>
                      {contract.fiscal?.email ? (
                        <a href={`mailto:${contract.fiscal.email}`} className="text-xs text-slate-600 underline">
                          {contract.fiscal.email}
                        </a>
                      ) : null}
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Gestor</p>
                      <p className="mt-1 text-sm text-slate-800">{contract.manager?.name ?? "-"}</p>
                      {contract.manager?.email ? (
                        <a href={`mailto:${contract.manager.email}`} className="text-xs text-slate-600 underline">
                          {contract.manager.email}
                        </a>
                      ) : null}
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fornecedor cadastrado</p>
                      <p className="mt-1 text-sm text-slate-800">{contract.supplier?.name ?? "-"}</p>
                      {contract.supplier?.cnpj ? (
                        <p className="text-xs text-slate-600">{contract.supplier.cnpj}</p>
                      ) : null}
                    </div>
                  </div>
                </Card>

                {canViewFinancial ? <ContractPricingItemsPanel contract={contract} /> : null}
                <ContractImplantationProportionPanel data={contract.featureImplantationProportion} />
                <ContractAmendmentsPanel contract={contract} />
                <ContractOccurrencesPanel contract={contract} />
              </>
            ) : null}
          </TabsContent>
        ) : null}

        {visibleTabs.some((t) => t.id === "arquivos") ? (
          <TabsContent
            value="arquivos"
            forceMount={mountedTabs.has("arquivos") ? true : undefined}
            className="mt-0 space-y-4 focus-visible:ring-0 data-[state=inactive]:hidden"
          >
            {mountedTabs.has("arquivos") ? <ContractFilesPanel contractId={contract.id} /> : null}
          </TabsContent>
        ) : null}

        {visibleTabs.some((t) => t.id === "consumos") ? (
          <TabsContent
            value="consumos"
            forceMount={mountedTabs.has("consumos") ? true : undefined}
            className="mt-0 space-y-4 focus-visible:ring-0 data-[state=inactive]:hidden"
          >
            {mountedTabs.has("consumos") ? (
              <ContractConsumptionsPanel contractId={contract.id} canEdit={canEditContract} />
            ) : null}
          </TabsContent>
        ) : null}

        {visibleTabs.some((t) => t.id === "chamados-glpi") ? (
          <TabsContent
            value="chamados-glpi"
            forceMount={mountedTabs.has("chamados-glpi") ? true : undefined}
            className="mt-0 space-y-4 focus-visible:ring-0 data-[state=inactive]:hidden"
          >
            {mountedTabs.has("chamados-glpi") ? (
              <>
                <Card className="p-5">
                  <h2 className="text-base font-semibold text-slate-900">Grupos GLPI vinculados</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Consulta dos grupos associados a este contrato. Para alterar o vínculo, use a edição dos dados do
                    contrato na listagem.
                  </p>
                  <p className="mt-3 text-sm text-slate-700" title={glpiGroupsSummary.full}>
                    {glpiGroupsSummary.text === "-" ? "-" : glpiGroupsSummary.full}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    Para alterar os vínculos, use «Editar» na listagem de contratos.
                  </p>
                  <div className="mt-3">
                    <Button asChild variant="outline" size="sm">
                      <Link href={"/contracts" as Route}>Ir à listagem para editar o contrato</Link>
                    </Button>
                  </div>
                </Card>
                <ContractGlpiTicketsPanel
                  contractId={contract.id}
                  glpiGroups={glpiGroups}
                  canEdit={canEditContract}
                />
              </>
            ) : null}
          </TabsContent>
        ) : null}

        {visibleTabs.some((t) => t.id === "cronogramas") ? (
          <TabsContent
            value="cronogramas"
            forceMount={mountedTabs.has("cronogramas") ? true : undefined}
            className="mt-0 focus-visible:ring-0 data-[state=inactive]:hidden"
          >
            {mountedTabs.has("cronogramas") ? <ContractSchedulesPanel contract={contract} /> : null}
          </TabsContent>
        ) : null}

        {visibleTabs.some((t) => t.id === "notificacoes") ? (
          <TabsContent
            value="notificacoes"
            forceMount={mountedTabs.has("notificacoes") ? true : undefined}
            className="mt-0 focus-visible:ring-0 data-[state=inactive]:hidden"
          >
            {mountedTabs.has("notificacoes") ? <ContractNotificationsPanel contractId={contract.id} /> : null}
          </TabsContent>
        ) : null}

        {visibleTabs.some((t) => t.id === "grupos-validacao") ? (
          <TabsContent
            value="grupos-validacao"
            forceMount={mountedTabs.has("grupos-validacao") ? true : undefined}
            className="mt-0 focus-visible:ring-0 data-[state=inactive]:hidden"
          >
            {mountedTabs.has("grupos-validacao") ? (
              <ContractValidationGroupsPanel
                contractId={contract.id}
                groups={contract.validationGroups ?? []}
              />
            ) : null}
          </TabsContent>
        ) : null}

        {visibleTabs.some((t) => t.id === "modulos") ? (
          <TabsContent
            value="modulos"
            forceMount={mountedTabs.has("modulos") ? true : undefined}
            className="mt-0 focus-visible:ring-0 data-[state=inactive]:hidden"
          >
            {mountedTabs.has("modulos") ? <ContractStructureEditor contract={contract} /> : null}
          </TabsContent>
        ) : null}

        {visibleTabs.some((t) => t.id === "auditoria") ? (
          <TabsContent
            value="auditoria"
            forceMount={mountedTabs.has("auditoria") ? true : undefined}
            className="mt-0 focus-visible:ring-0 data-[state=inactive]:hidden"
          >
            {mountedTabs.has("auditoria") ? <ContractItemChangeHistoryPanel contractId={contract.id} /> : null}
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
