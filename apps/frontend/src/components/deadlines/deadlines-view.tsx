"use client";

import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import type {
  DeadlineAttentionLevel,
  DeadlineItem,
  DeadlineListResponse,
  DeadlineOrigin,
  DeadlineStatus
} from "@/lib/api";
import { getAuthMe, getDeadlines, getMyPermissions, recalculateDeadlines } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/tables/data-table";

const ORIGIN_LABEL: Record<DeadlineOrigin, string> = {
  CONTRACT_END: "Fim de vigência",
  SCHEDULE_STEP: "Marco de cronograma",
  OCCURRENCE: "Ocorrência",
  MEASUREMENT_PENDING: "Medição pendente",
  FEATURE_VALIDATION: "Validação de funcionalidade",
  GLPI_SLA: "SLA GLPI",
  DOCUMENT: "Documento",
  OTHER: "Outro"
};

const STATUS_LABEL: Record<DeadlineStatus, string> = {
  FUTURE: "Futuro",
  NEAR_DUE: "Próximo",
  DUE_TODAY: "Vence hoje",
  OVERDUE: "Atrasado",
  DONE_ON_TIME: "Concluído no prazo",
  DONE_LATE: "Concluído com atraso",
  SUSPENDED: "Suspenso",
  EXTENDED: "Prorrogado",
  CANCELLED: "Cancelado"
};

const ATTENTION_LABEL: Record<DeadlineAttentionLevel, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  CRITICAL: "Crítica"
};

const columnHelper = createColumnHelper<DeadlineItem>();

type Props = {
  initial: DeadlineListResponse;
  dataLoadErrors?: string[];
};

function filterKey(params: {
  origin: string;
  status: string;
  attentionLevel: string;
  q: string;
}): string {
  return [params.origin, params.status, params.attentionLevel, params.q].join("|");
}

export function DeadlinesView({ initial, dataLoadErrors = [] }: Props): JSX.Element {
  const queryClient = useQueryClient();
  const [origin, setOrigin] = useState("");
  const [status, setStatus] = useState("");
  const [attentionLevel, setAttentionLevel] = useState("");
  const [q, setQ] = useState("");

  const key = filterKey({ origin, status, attentionLevel, q });

  const { data = initial, isFetching, refetch } = useQuery({
    queryKey: queryKeys.deadlines(key),
    queryFn: () =>
      getDeadlines({
        origin: origin || undefined,
        status: status || undefined,
        attentionLevel: attentionLevel || undefined,
        q: q.trim() || undefined
      }),
    initialData: key === "|||" ? initial : undefined
  });

  const { data: me } = useQuery({
    queryKey: queryKeys.authMe,
    queryFn: getAuthMe
  });

  const { data: permissions } = useQuery({
    queryKey: queryKeys.myPermissions,
    queryFn: getMyPermissions,
    staleTime: 10 * 60_000
  });

  const canRecalculate =
    me?.role === "ADMIN" || Boolean(permissions?.keys?.includes("deadlines.recalculate"));

  const recalcMutation = useMutation({
    mutationFn: recalculateDeadlines,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["gestao", "deadlines"] });
      await refetch();
    }
  });

  const summary = data.summary;
  const items = data.items;

  const columns = useMemo<ColumnDef<DeadlineItem, any>[]>(
    () => [
      columnHelper.accessor("dueAt", {
        header: "Prazo",
        cell: (info) => (
          <span className="whitespace-nowrap tabular-nums text-foreground">
            {new Date(info.getValue()).toLocaleDateString("pt-BR")}
          </span>
        )
      }),
      columnHelper.accessor("status", {
        header: "Situação",
        cell: (info) => {
          const value = info.getValue() as DeadlineStatus;
          const tone =
            value === "OVERDUE"
              ? "text-destructive"
              : value === "DUE_TODAY"
                ? "text-amber-700 dark:text-amber-400"
                : value === "NEAR_DUE"
                  ? "text-orange-700 dark:text-orange-400"
                  : "text-muted-foreground";
          return <span className={tone}>{STATUS_LABEL[value] ?? value}</span>;
        }
      }),
      columnHelper.accessor("attentionLevel", {
        header: "Atenção",
        cell: (info) => {
          const value = info.getValue() as DeadlineAttentionLevel;
          return ATTENTION_LABEL[value] ?? value;
        }
      }),
      columnHelper.accessor("origin", {
        header: "Tipo",
        cell: (info) => {
          const value = info.getValue() as DeadlineOrigin;
          return <span className="text-muted-foreground">{ORIGIN_LABEL[value] ?? value}</span>;
        }
      }),
      columnHelper.accessor("title", {
        header: "Título",
        cell: (info) => (
          <span className="max-w-[240px] truncate font-medium text-foreground" title={info.getValue()}>
            {info.getValue()}
          </span>
        )
      }),
      columnHelper.accessor((row) => row.contract?.internalCode ?? row.contract?.number ?? "-", {
        id: "contract",
        header: "Contrato",
        cell: (info) => {
          const row = info.row.original;
          if (!row.contractId) return <span className="text-muted-foreground">-</span>;
          return (
            <Link
              href={`/contracts/${row.contractId}`}
              className="text-xs text-foreground underline-offset-4 hover:underline"
              title={row.contract?.name ?? undefined}
            >
              {String(info.getValue())}
            </Link>
          );
        }
      }),
      columnHelper.accessor((row) => row.responsibleLabel ?? "-", {
        id: "responsible",
        header: "Responsável",
        cell: (info) => <span className="text-muted-foreground">{String(info.getValue())}</span>
      }),
      columnHelper.display({
        id: "actions",
        enableSorting: false,
        header: () => <span className="sr-only">Ações</span>,
        cell: (ctx) => {
          const href = ctx.row.original.href;
          if (!href) return null;
          return (
            <div className="text-right">
              <Button variant="link" className="h-auto p-0 text-foreground" asChild>
                <Link href={href}>Abrir</Link>
              </Button>
            </div>
          );
        }
      })
    ],
    []
  );

  const cards: Array<{ label: string; value: number; hint?: string }> = [
    { label: "Abertos", value: summary.totalOpen, hint: "Futuro, próximo, hoje, atrasado, suspenso ou prorrogado" },
    { label: "Atrasados", value: summary.byStatus.OVERDUE ?? 0 },
    { label: "Vencem hoje", value: summary.byStatus.DUE_TODAY ?? 0 },
    { label: "Próximos 7 dias", value: summary.byStatus.NEAR_DUE ?? 0 },
    {
      label: "Funcionalidades",
      value: summary.byOrigin.FEATURE_VALIDATION ?? 0,
      hint: "Alertas de validação e acompanhamento de módulo"
    },
    { label: "Fim de vigência", value: summary.byOrigin.CONTRACT_END ?? 0 }
  ];

  return (
    <div className="space-y-6">
      {dataLoadErrors.length > 0 ? <DataLoadAlert messages={dataLoadErrors} /> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Prazos e pendências</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Painel consolidado de prazos materializados a partir de vigências, cronogramas, ocorrências, medições e
            funcionalidades pendentes. Respeita o órgão do contexto ativo.
          </p>
        </div>
        {canRecalculate ? (
          <Button
            type="button"
            variant="outline"
            disabled={recalcMutation.isPending}
            onClick={() => recalcMutation.mutate()}
          >
            {recalcMutation.isPending ? "Recalculando…" : "Recalcular prazos"}
          </Button>
        ) : null}
      </div>

      {recalcMutation.isError ? (
        <DataLoadAlert
          messages={[recalcMutation.error instanceof Error ? recalcMutation.error.message : "Falha ao recalcular"]}
        />
      ) : null}
      {recalcMutation.isSuccess ? (
        <p className="text-sm text-muted-foreground">
          Recálculo concluído: {recalcMutation.data.desired} desejados, {recalcMutation.data.upserted} atualizados,{" "}
          {recalcMutation.data.cancelled} cancelados.
        </p>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border bg-card p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{card.value}</p>
            {card.hint ? <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p> : null}
          </div>
        ))}
      </section>

      <section className="space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Tipo</span>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
            >
              <option value="">Todos</option>
              {Object.entries(ORIGIN_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Situação</span>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Todas (exceto cancelados)</option>
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Atenção</span>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={attentionLevel}
              onChange={(e) => setAttentionLevel(e.target.value)}
            >
              <option value="">Todas</option>
              {Object.entries(ATTENTION_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Pesquisar</span>
            <input
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Título, contrato, ação…"
            />
          </label>
        </div>

        <DataTable
          columns={columns}
          data={items}
          searchPlaceholder="Filtrar na tabela…"
          emptyLabel={isFetching ? "Carregando prazos…" : "Nenhum prazo encontrado com os filtros atuais."}
        />
      </section>
    </div>
  );
}
