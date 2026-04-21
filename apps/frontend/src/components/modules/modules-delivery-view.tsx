"use client";

import type { Route } from "next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { ContractItemDeliveryStatus, ContractModulesDeliveryOverview } from "@/lib/api";
import { formatBrl } from "@/lib/format-brl";
import { getModulesDeliveryOverview, updateContractFeature } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { Badge } from "@/components/ui/badge";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const deliveryLabels: Record<ContractItemDeliveryStatus, string> = {
  NOT_DELIVERED: "Não entregue",
  PARTIALLY_DELIVERED: "Parcialmente entregue",
  DELIVERED: "Entregue"
};

const deliveryOptions: ContractItemDeliveryStatus[] = ["NOT_DELIVERED", "PARTIALLY_DELIVERED", "DELIVERED"];

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

export function ModulesDeliveryView({ initialRows, dataLoadErrors = [] }: Props): JSX.Element {
  const qc = useQueryClient();
  const [openContractIds, setOpenContractIds] = useState<Set<string>>(() => new Set(initialRows.map((r) => r.id)));

  const { data: rows = initialRows } = useQuery({
    queryKey: queryKeys.modulesDeliveryOverview,
    queryFn: getModulesDeliveryOverview,
    initialData: initialRows
  });

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

  const busyRowKey =
    updateDeliveryMut.isPending && updateDeliveryMut.variables
      ? `${updateDeliveryMut.variables.contractId}-${updateDeliveryMut.variables.moduleId}-${updateDeliveryMut.variables.featureId}`
      : null;

  const toggleContract = (id: string): void => {
    setOpenContractIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalContracts = rows.length;
  const totalItems = useMemo(() => rows.reduce((s, r) => s + countItems(r.modules), 0), [rows]);

  return (
    <div className="space-y-6">
      {dataLoadErrors.length > 0 ? <DataLoadAlert messages={dataLoadErrors} /> : null}

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Funcionalidades</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Por contrato: <strong className="font-medium text-foreground">módulos</strong> e respetivas{" "}
          <strong className="font-medium text-foreground">funcionalidades</strong> (itens de entrega). Cada funcionalidade
          regista se a entrega está <strong className="font-medium text-foreground">não feita</strong>,{" "}
          <strong className="font-medium text-foreground">parcial</strong> ou <strong className="font-medium text-foreground">concluída</strong>,
          para acompanhar se o contrato está a ser prestado. No indicador proporcional ao valor mensal, cada parcial conta como{" "}
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
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => toggleContract(contract.id)}
                >
                  <ChevronDown
                    className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-out", isOpen && "rotate-180")}
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
                        <span className="text-emerald-700 dark:text-emerald-400">{nOk} entregues</span>
                        {" · "}
                        <span className="text-amber-700 dark:text-amber-400">{nPart} parciais</span>
                        {" · "}
                        <span className="text-rose-700 dark:text-rose-400">{nNot} não entregues</span>
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">Sem módulos ou itens — configure na página do contrato.</p>
                    )}
                    {prop?.applicable && prop.proportionalMonthlyValue && prop.ratioImplantedPercent ? (
                      <p className="mt-1 text-xs font-medium text-sky-900 dark:text-sky-200">
                        Proporcional ao valor mensal: {prop.ratioImplantedPercent}% → {formatBrl(prop.proportionalMonthlyValue)} (contrato{" "}
                        {formatBrl(prop.contractMonthlyValue)}/mês)
                      </p>
                    ) : prop?.explanation ? (
                      <p className="mt-1 text-xs text-muted-foreground">{prop.explanation}</p>
                    ) : null}
                  </div>
                  <Link
                    href={`/contracts/${contract.id}` as Route}
                    className="shrink-0 text-xs font-medium text-primary underline-offset-4 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Abrir contrato
                  </Link>
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
                          {contract.modules.map((mod) => (
                            <div key={mod.id} className="rounded-lg border border-border/50 bg-muted/20 px-3 py-3">
                              <h3 className="text-sm font-semibold text-foreground">
                                {mod.name}
                                <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">peso {serializeWeight(mod.weight)}</span>
                              </h3>
                              {mod.features.length === 0 ? (
                                <p className="mt-2 text-xs text-muted-foreground">Nenhum item neste módulo.</p>
                              ) : (
                                <ul className="mt-3 space-y-2">
                                  {mod.features.map((item) => {
                                    const ds = (item.deliveryStatus ?? "NOT_DELIVERED") as ContractItemDeliveryStatus;
                                    const rowBusy =
                                      busyRowKey === `${contract.id}-${mod.id}-${item.id}`;
                                    return (
                                      <li
                                        key={item.id}
                                        className="flex flex-col gap-2 rounded-md border border-border/40 bg-background/80 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                                      >
                                        <div className="min-w-0 flex-1">
                                          <p className="text-sm font-medium text-foreground">{item.name}</p>
                                          <p className="text-[11px] text-muted-foreground">Peso {serializeWeight(item.weight)}</p>
                                        </div>
                                        <div className="w-full shrink-0 sm:w-[14.5rem]">
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
                                            <SelectTrigger className="h-9 text-left text-xs" aria-label={`Estado de entrega: ${item.name}`}>
                                              <SelectValue placeholder="Estado" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {deliveryOptions.map((opt) => (
                                                <SelectItem key={opt} value={opt} className="text-xs">
                                                  {deliveryLabels[opt]}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                          ))}
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

      {updateDeliveryMut.isError ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
          {updateDeliveryMut.error instanceof Error ? updateDeliveryMut.error.message : "Não foi possível atualizar o estado de entrega."}
        </p>
      ) : null}
    </div>
  );
}
