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
import { Modal } from "@/components/ui/modal";
import "@/styles/gti-exec-metric-dash.css";
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

function formatDashPct(count: number, total: number): string {
  if (total <= 0) {
    return "—";
  }
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 0 }).format(
    (100 * count) / total
  );
}

type ContractDashTone = "total" | "active" | "expired" | "suspended" | "monthly" | "expiring" | "amendments";

function ContractDashMetricCard({
  tone,
  value,
  title,
  hint,
  icon,
  pctOfTotal
}: {
  tone: ContractDashTone;
  value: string | number;
  title: string;
  hint: string;
  icon: JSX.Element;
  pctOfTotal?: { count: number; total: number } | null;
}): JSX.Element {
  const pctEl =
    pctOfTotal && pctOfTotal.total > 0 ? (
      <span className="aging-card__pct" title="Percentual do total na lista">
        {formatDashPct(pctOfTotal.count, pctOfTotal.total)}%
      </span>
    ) : null;
  const kpiOnly = tone === "monthly";
  return (
    <div
      className={`aging-card aging-card--ctr-${tone}${kpiOnly ? " aging-card--kpi-only" : ""}`}
      role="listitem"
      aria-label={`${title}: ${value}`}
    >
      <div className="aging-card__iconwrap">{icon}</div>
      <div className="aging-card__value-row">
        <span className="aging-card__value">{value}</span>
        {pctEl}
      </div>
      <h3 className="aging-card__title">{title}</h3>
      <p className="aging-card__hint">{hint}</p>
    </div>
  );
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

      <div className="gti-exec-metric-dash">
        <section
          className="aging-dash aging-dash--contracts"
          aria-label="Resumo dos contratos"
          aria-labelledby="contracts-dash-title"
        >
          <div className="aging-dash__intro">
            <h2 id="contracts-dash-title" className="aging-dash__title">
              Resumo dos contratos
            </h2>
            {dash.total > 0 ? (
              <>
                <div className="aging-dash__total-row">
                  <p className="aging-dash__total">
                    <span className="aging-dash__total-num">{dash.total}</span>
                    <span className="aging-dash__total-label"> contratos na lista</span>
                  </p>
                </div>
                <p className="aging-dash__lede">Métricas calculadas com base na lista atual (mesmos dados da tabela abaixo).</p>
                <div className="aging-dash__panel mt-3">
                  <h3 className="aging-dash__panel-title">Distribuição por status</h3>
                  <p className="aging-dash__panel-lede">Passe o rato sobre cada faixa para ver o rótulo e a contagem.</p>
                  <div className="aging-dash__status-track" role="img" aria-label="Distribuição por status na lista">
                    {statusBar.activePct > 0 ? (
                      <span
                        style={{ width: `${statusBar.activePct}%`, backgroundColor: "#14b8a6" }}
                        title={`${statusLabel.ACTIVE}: ${dash.active}`}
                      />
                    ) : null}
                    {statusBar.expiredPct > 0 ? (
                      <span
                        style={{ width: `${statusBar.expiredPct}%`, backgroundColor: "#71717a" }}
                        title={`${statusLabel.EXPIRED}: ${dash.expired}`}
                      />
                    ) : null}
                    {statusBar.suspendedPct > 0 ? (
                      <span
                        style={{ width: `${statusBar.suspendedPct}%`, backgroundColor: "#f97316" }}
                        title={`${statusLabel.SUSPENDED}: ${dash.suspended}`}
                      />
                    ) : null}
                    {statusBar.otherPct > 0 ? (
                      <span
                        style={{ width: `${statusBar.otherPct}%`, backgroundColor: "#a855f7" }}
                        title={`Outros status: ${dash.otherStatus}`}
                      />
                    ) : null}
                  </div>
                </div>
              </>
            ) : (
              <p className="aging-dash__lede">
                Quando existirem contratos na lista, aparecem aqui totais por status, valor mensal agregado dos ativos e
                alertas de vigência.
              </p>
            )}
          </div>

          {dash.total > 0 ? (
            <>
              <div className="aging-dash__grid aging-dash__grid--cols-4 mt-4" role="list">
                <ContractDashMetricCard
                  tone="total"
                  value={dash.total}
                  title="Total na lista"
                  hint="Contratos carregados nesta página"
                  icon={<Layers className="aging-card__svg" aria-hidden />}
                />
                <ContractDashMetricCard
                  tone="active"
                  value={dash.active}
                  title={statusLabel.ACTIVE}
                  hint="Em vigência"
                  pctOfTotal={{ count: dash.active, total: dash.total }}
                  icon={<FileStack className="aging-card__svg" aria-hidden />}
                />
                <ContractDashMetricCard
                  tone="expired"
                  value={dash.expired}
                  title={statusLabel.EXPIRED}
                  hint="Histórico"
                  pctOfTotal={{ count: dash.expired, total: dash.total }}
                  icon={<FileStack className="aging-card__svg" aria-hidden />}
                />
                <ContractDashMetricCard
                  tone="suspended"
                  value={dash.suspended}
                  title={statusLabel.SUSPENDED}
                  hint="Pausados"
                  pctOfTotal={{ count: dash.suspended, total: dash.total }}
                  icon={<FileStack className="aging-card__svg" aria-hidden />}
                />
              </div>
              <div className="aging-dash__grid aging-dash__grid--cols-3 mt-4" role="list">
                <ContractDashMetricCard
                  tone="monthly"
                  value={formatBrl(dash.monthlyActiveSum)}
                  title="Valor mensal (ativos)"
                  hint="Soma dos contratos com status ativo"
                  icon={<Layers className="aging-card__svg" aria-hidden />}
                />
                <ContractDashMetricCard
                  tone="expiring"
                  value={dash.expiringActiveWithin90Days}
                  title="Fim da vigência em 90 dias"
                  hint="Contratos ativos com data de fim no período"
                  icon={<CalendarClock className="aging-card__svg" aria-hidden />}
                />
                <ContractDashMetricCard
                  tone="amendments"
                  value={dash.amendmentsSum}
                  title="Aditivos registados"
                  hint="Soma dos contadores na lista"
                  icon={<FileStack className="aging-card__svg" aria-hidden />}
                />
              </div>
              {dash.otherStatus > 0 ? (
                <p className="aging-dash__delayed mt-3">
                  <AlertTriangle className="mr-1 inline-block h-3.5 w-3.5 align-text-bottom text-amber-600" aria-hidden />
                  <span className="aging-dash__delayed-k">Atenção</span>
                  <span className="aging-dash__delayed-v"> {dash.otherStatus}</span>
                  <span className="text-[#334155]">
                    {" "}
                    contrato(s) com status fora do conjunto habitual (ativo, encerrado, suspenso).
                  </span>
                </p>
              ) : null}
            </>
          ) : null}
        </section>
      </div>

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
