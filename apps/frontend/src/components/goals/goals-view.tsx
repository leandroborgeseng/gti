"use client";

import type { Route } from "next";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Target } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Goal, UserRecord } from "@/lib/api";
import { getGoals } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { GoalCreateForm } from "@/components/actions/goal-create-form";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/tables/data-table";

const statusLabel: Record<string, string> = {
  PLANNED: "Planejada",
  IN_PROGRESS: "Em andamento",
  COMPLETED: "Concluída"
};

const columnHelper = createColumnHelper<Goal>();

type Props = {
  goals: Goal[];
  users?: UserRecord[];
  dataLoadErrors?: string[];
};

export function GoalsView({ goals: initialGoals, users = [], dataLoadErrors = [] }: Props): JSX.Element {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);

  const { data: goals = initialGoals } = useQuery({
    queryKey: queryKeys.goals,
    queryFn: getGoals,
    initialData: initialGoals
  });

  const columns = useMemo<ColumnDef<Goal, any>[]>(
    () => [
      columnHelper.accessor("title", {
        header: "Meta",
        cell: (info) => (
          <span className="max-w-[240px] truncate font-medium text-foreground" title={info.getValue()}>
            {info.getValue()}
          </span>
        )
      }),
      columnHelper.accessor("year", {
        header: "Ano",
        cell: (info) => <span className="tabular-nums text-muted-foreground">{info.getValue()}</span>
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: (info) => (
          <Badge variant="secondary" className="font-normal">
            {statusLabel[info.getValue()] ?? info.getValue()}
          </Badge>
        )
      }),
      columnHelper.accessor((row) => row.calculatedProgress ?? 0, {
        id: "progress",
        header: () => <span className="flex w-full justify-end">Progresso</span>,
        cell: (info) => <div className="text-right tabular-nums text-foreground">{info.getValue()}%</div>
      }),
      columnHelper.display({
        id: "actions",
        enableSorting: false,
        header: () => <span className="sr-only">Ações</span>,
        cell: (ctx) => (
          <div className="text-right">
            <Button variant="link" className="h-auto p-0 text-foreground" asChild>
              <Link href={`/goals/${ctx.row.original.id}` as Route}>Abrir</Link>
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
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Metas estratégicas</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Acompanhamento resumido do andamento. Use <strong className="font-medium text-foreground">Nova meta</strong> para cadastrar; o
            detalhe e as ações ficam na página da meta.
          </p>
        </div>
        <Button type="button" className="shrink-0 gap-2" onClick={() => setModalOpen(true)}>
          <Target className="h-4 w-4" />
          Nova meta
        </Button>
      </div>

      <section className="overflow-hidden rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <DataTable
          columns={columns}
          data={goals}
          searchPlaceholder="Pesquisar meta, ano…"
          emptyLabel='Nenhuma meta ainda. Clique em "Nova meta" para cadastrar.'
        />
      </section>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nova meta"
        description="Cadastro inicial. Na página da meta pode adicionar ações, vínculos e progresso manual."
      >
        <GoalCreateForm
          users={users}
          onSuccess={() => {
            setModalOpen(false);
            void qc.invalidateQueries({ queryKey: queryKeys.goals });
            void qc.invalidateQueries({ queryKey: queryKeys.users });
          }}
        />
      </Modal>
    </div>
  );
}
