"use client";

import type { Route } from "next";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, FilePlus2, FileStack, Layers, Pencil } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Contract } from "@/lib/api";
import { getContracts } from "@/lib/api";
import { formatBrl } from "@/lib/format-brl";
import { queryKeys } from "@/lib/query-keys";
import { ContractForm } from "@/components/actions/contract-form";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/tables/data-table";

const statusLabel: Record<string, string> = {
  ACTIVE: "Ativo",
  EXPIRED: "Encerrado",
  SUSPENDED: "Suspenso"
};

function parseMonthlyValueBrl(raw: string): number {
  const n = Number(String(raw).trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function computeContractDashboardStats(list: Contract[]): {
  total: number;
  active: number;
  expired: number;
  suspended: number;
  otherStatus: number;
  monthlyActiveSum: number;
  expiringActiveWithin90Days: number;
  amendmentsSum: number;
} {
  const today = startOfDay(new Date());
  const horizon = startOfDay(new Date());
  horizon.setDate(horizon.getDate() + 90);

  let active = 0;
  let expired = 0;
  let suspended = 0;
  let otherStatus = 0;
  let monthlyActiveSum = 0;
  let expiringActiveWithin90Days = 0;
  let amendmentsSum = 0;

  for (const c of list) {
    switch (c.status) {
      case "ACTIVE":
        active++;
        monthlyActiveSum += parseMonthlyValueBrl(c.monthlyValue);
        {
          const end = startOfDay(new Date(c.endDate));
          if (end >= today && end <= horizon) {
            expiringActiveWithin90Days++;
          }
        }
        break;
      case "EXPIRED":
        expired++;
        break;
      case "SUSPENDED":
        suspended++;
        break;
      default:
        otherStatus++;
        break;
    }
    amendmentsSum += c._count?.amendments ?? 0;
  }

  return {
    total: list.length,
    active,
    expired,
    suspended,
    otherStatus,
    monthlyActiveSum,
    expiringActiveWithin90Days,
    amendmentsSum
  };
}

const columnHelper = createColumnHelper<Contract>();

type Props = {
  contracts: Contract[];
  dataLoadErrors?: string[];
};

export function ContractsView({ contracts: initialContracts, dataLoadErrors = [] }: Props): JSX.Element {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);

  const { data: contracts = initialContracts } = useQuery({
    queryKey: queryKeys.contracts,
    queryFn: getContracts,
    initialData: initialContracts
  });

  const dash = useMemo(() => computeContractDashboardStats(contracts), [contracts]);

  const statusBar = useMemo(() => {
    const { total, active, expired, suspended, otherStatus } = dash;
    if (total <= 0) {
      return { activePct: 0, expiredPct: 0, suspendedPct: 0, otherPct: 0 };
    }
    const activePct = (100 * active) / total;
    const expiredPct = (100 * expired) / total;
    const suspendedPct = (100 * suspended) / total;
    const otherPct = (100 * otherStatus) / total;
    return { activePct, expiredPct, suspendedPct, otherPct };
  }, [dash]);

  const columns = useMemo<ColumnDef<Contract, any>[]>(
    () => [
      columnHelper.accessor("number", {
        header: "Número",
        cell: (info) => <span className="font-mono text-xs text-muted-foreground">{info.getValue()}</span>
      }),
      columnHelper.accessor("name", {
        header: "Nome",
        cell: (info) => (
          <span className="max-w-[200px] truncate font-medium text-foreground" title={info.getValue()}>
            {info.getValue()}
          </span>
        )
      }),
      columnHelper.accessor((row) => row.supplier?.name ?? row.companyName, {
        id: "supplier",
        header: "Fornecedor",
        cell: (info) => (
          <span className="max-w-[180px] truncate text-muted-foreground" title={String(info.getValue())}>
            {String(info.getValue())}
          </span>
        )
      }),
      columnHelper.accessor("managingUnit", {
        header: "Órgão gestor",
        cell: (info) => (
          <span className="max-w-[140px] truncate text-muted-foreground" title={info.getValue() ?? ""}>
            {info.getValue() ?? "—"}
          </span>
        )
      }),
      columnHelper.accessor("monthlyValue", {
        header: () => <span className="flex w-full justify-end">Valor mensal</span>,
        cell: (info) => (
          <div className="whitespace-nowrap text-right tabular-nums text-foreground">
            R${" "}
            {Number(info.getValue()).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        )
      }),
      columnHelper.accessor("endDate", {
        header: "Vigência (fim)",
        cell: (info) => (
          <span className="whitespace-nowrap text-muted-foreground">
            {new Date(info.getValue()).toLocaleDateString("pt-BR")}
          </span>
        )
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: (info) => (
          <Badge variant="secondary" className="font-normal">
            {statusLabel[info.getValue()] ?? info.getValue()}
          </Badge>
        )
      }),
      columnHelper.accessor((row) => row._count?.amendments ?? 0, {
        id: "amendments",
        header: () => <span className="flex w-full justify-center tabular-nums">Aditivos</span>,
        cell: (info) => <div className="text-center tabular-nums text-muted-foreground">{info.getValue()}</div>
      }),
      columnHelper.display({
        id: "actions",
        enableSorting: false,
        header: () => <span className="sr-only">Ações</span>,
        cell: (ctx) => (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="link"
              className="h-auto gap-1 p-0 text-foreground"
              onClick={() => {
                setEditingContract(ctx.row.original);
                setModalOpen(true);
              }}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              Editar
            </Button>
            <Button variant="link" className="h-auto p-0 text-foreground" asChild>
              <Link href={`/contracts/${ctx.row.original.id}` as Route}>Abrir</Link>
            </Button>
          </div>
        )
      })
    ],
    []
  );

  return (
    <div className="space-y-6">
      {dataLoadErrors.length > 0 ? <DataLoadAlert messages={dataLoadErrors} /> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Contratos</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Lista dos contratos cadastrados. Use <strong className="font-medium text-foreground">Novo contrato</strong> para abrir o
            cadastro sem sair desta página.
          </p>
        </div>
        <Button
          type="button"
          className="shrink-0 gap-2"
          onClick={() => {
            setEditingContract(null);
            setModalOpen(true);
          }}
        >
          <FilePlus2 className="h-4 w-4" />
          Novo contrato
        </Button>
      </div>

      <section aria-label="Resumo dos contratos" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Resumo</h2>
          {dash.total > 0 ? (
            <p className="text-xs text-muted-foreground">Métricas calculadas com base na lista atual.</p>
          ) : null}
        </div>
        {dash.total > 0 ? (
          <>
            <div
              className="flex h-2 overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label="Distribuição por status na lista"
            >
              {statusBar.activePct > 0 ? (
                <span
                  className="h-full bg-emerald-500/90"
                  style={{ width: `${statusBar.activePct}%` }}
                  title={`${statusLabel.ACTIVE}: ${dash.active}`}
                />
              ) : null}
              {statusBar.expiredPct > 0 ? (
                <span
                  className="h-full bg-slate-400/90"
                  style={{ width: `${statusBar.expiredPct}%` }}
                  title={`${statusLabel.EXPIRED}: ${dash.expired}`}
                />
              ) : null}
              {statusBar.suspendedPct > 0 ? (
                <span
                  className="h-full bg-amber-500/90"
                  style={{ width: `${statusBar.suspendedPct}%` }}
                  title={`${statusLabel.SUSPENDED}: ${dash.suspended}`}
                />
              ) : null}
              {statusBar.otherPct > 0 ? (
                <span
                  className="h-full bg-violet-500/80"
                  style={{ width: `${statusBar.otherPct}%` }}
                  title={`Outros status: ${dash.otherStatus}`}
                />
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Card className="p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm font-medium text-muted-foreground">Total na lista</CardTitle>
                    <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-foreground">{dash.total}</p>
                    <CardDescription className="mt-1">Contratos carregados</CardDescription>
                  </div>
                  <span className="rounded-md border bg-muted/40 p-2 text-muted-foreground">
                    <Layers className="h-4 w-4" aria-hidden />
                  </span>
                </div>
              </Card>
              <Card className="p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm font-medium text-muted-foreground">{statusLabel.ACTIVE}</CardTitle>
                    <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-foreground">{dash.active}</p>
                    <CardDescription className="mt-1">Em vigência</CardDescription>
                  </div>
                  <span className="rounded-md border bg-emerald-500/10 p-2 text-emerald-700 dark:text-emerald-400">
                    <FileStack className="h-4 w-4" aria-hidden />
                  </span>
                </div>
              </Card>
              <Card className="p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm font-medium text-muted-foreground">{statusLabel.EXPIRED}</CardTitle>
                    <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-foreground">{dash.expired}</p>
                    <CardDescription className="mt-1">Histórico</CardDescription>
                  </div>
                  <span className="rounded-md border bg-slate-500/10 p-2 text-slate-600 dark:text-slate-300">
                    <FileStack className="h-4 w-4" aria-hidden />
                  </span>
                </div>
              </Card>
              <Card className="p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm font-medium text-muted-foreground">{statusLabel.SUSPENDED}</CardTitle>
                    <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-foreground">{dash.suspended}</p>
                    <CardDescription className="mt-1">Pausados</CardDescription>
                  </div>
                  <span className="rounded-md border bg-amber-500/10 p-2 text-amber-800 dark:text-amber-400">
                    <FileStack className="h-4 w-4" aria-hidden />
                  </span>
                </div>
              </Card>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Card className="p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Valor mensal (ativos)</CardTitle>
                    <p className="mt-2 truncate text-xl font-semibold tabular-nums tracking-tight text-foreground sm:text-2xl">
                      {formatBrl(dash.monthlyActiveSum)}
                    </p>
                    <CardDescription className="mt-1">Soma dos contratos com status ativo</CardDescription>
                  </div>
                  <span className="shrink-0 rounded-md border bg-muted/40 p-2 text-muted-foreground">
                    <Layers className="h-4 w-4" aria-hidden />
                  </span>
                </div>
              </Card>
              <Card className="p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm font-medium text-muted-foreground">Fim da vigência em 90 dias</CardTitle>
                    <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                      {dash.expiringActiveWithin90Days}
                    </p>
                    <CardDescription className="mt-1">Contratos ativos com data de fim no período</CardDescription>
                  </div>
                  <span className="rounded-md border bg-sky-500/10 p-2 text-sky-800 dark:text-sky-300">
                    <CalendarClock className="h-4 w-4" aria-hidden />
                  </span>
                </div>
              </Card>
              <Card className="p-4 shadow-sm sm:col-span-2 lg:col-span-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm font-medium text-muted-foreground">Aditivos registados</CardTitle>
                    <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-foreground">{dash.amendmentsSum}</p>
                    <CardDescription className="mt-1">Soma dos contadores na lista</CardDescription>
                  </div>
                  <span className="rounded-md border bg-violet-500/10 p-2 text-violet-800 dark:text-violet-300">
                    <FileStack className="h-4 w-4" aria-hidden />
                  </span>
                </div>
              </Card>
            </div>
            {dash.otherStatus > 0 ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
                Existem {dash.otherStatus} contrato(s) com status fora do conjunto habitual (ativo, encerrado, suspenso).
              </p>
            ) : null}
          </>
        ) : (
          <p className="rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            Quando existirem contratos na lista, aparecem aqui totais por status, valor mensal agregado dos ativos e alertas
            de vigência.
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <DataTable
          columns={columns}
          data={contracts}
          searchPlaceholder="Pesquisar número, fornecedor, órgão…"
          emptyLabel='Nenhum contrato ainda. Clique em "Novo contrato" para cadastrar.'
        />
      </section>

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingContract(null);
        }}
        title={editingContract ? `Editar contrato ${editingContract.number}` : "Novo contrato"}
        description={
          editingContract
            ? "Altere os dados e clique em Guardar alterações. O número do contrato deve continuar único no sistema."
            : "Preencha os campos obrigatórios. O contrato fica disponível na lista assim que for salvo."
        }
      >
        <ContractForm
          key={editingContract?.id ?? "create"}
          initialContract={editingContract}
          onSuccess={() => {
            setModalOpen(false);
            setEditingContract(null);
            void qc.invalidateQueries({ queryKey: queryKeys.contracts });
            void qc.invalidateQueries({ queryKey: queryKeys.suppliers });
            void qc.invalidateQueries({ queryKey: queryKeys.fiscais });
          }}
        />
      </Modal>
    </div>
  );
}
