"use client";

import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Receipt } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Glosa } from "@/lib/api";
import { getGlosas } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { GlosaForm, type MeasurementOption } from "@/components/actions/glosa-form";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/tables/data-table";

const typeLabel: Record<string, string> = {
  ATRASO: "Atraso",
  NAO_ENTREGA: "Não entrega",
  SLA: "SLA",
  QUALIDADE: "Qualidade"
};

const columnHelper = createColumnHelper<Glosa>();

type Props = {
  glosas: Glosa[];
  measurementOptions?: MeasurementOption[];
  dataLoadErrors?: string[];
};

export function GlosasView({ glosas: initialGlosas, measurementOptions, dataLoadErrors = [] }: Props): JSX.Element {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);

  const { data: glosas = initialGlosas } = useQuery({
    queryKey: queryKeys.glosas,
    queryFn: getGlosas,
    initialData: initialGlosas
  });

  const columns = useMemo<ColumnDef<Glosa, any>[]>(
    () => [
      columnHelper.accessor(
        (row) =>
          row.measurement
            ? `${String(row.measurement.referenceMonth).padStart(2, "0")}/${row.measurement.referenceYear}`
            : row.measurementId,
        {
          id: "measurement",
          header: "Medição",
          cell: (info) => <span className="font-mono text-xs text-muted-foreground">{info.getValue()}</span>
        }
      ),
      columnHelper.accessor("type", {
        header: "Tipo",
        cell: (info) => <span className="text-foreground">{typeLabel[info.getValue()] ?? info.getValue()}</span>
      }),
      columnHelper.accessor("value", {
        header: () => <span className="flex w-full justify-end">Valor</span>,
        cell: (info) => <div className="text-right tabular-nums text-foreground">{info.getValue()}</div>
      }),
      columnHelper.accessor("createdBy", {
        header: "Criado por",
        cell: (info) => <span className="text-muted-foreground">{info.getValue()}</span>
      }),
      columnHelper.accessor("createdAt", {
        header: "Data",
        cell: (info) => (
          <span className="whitespace-nowrap text-muted-foreground">{new Date(info.getValue()).toLocaleDateString("pt-BR")}</span>
        )
      }),
      columnHelper.display({
        id: "actions",
        enableSorting: false,
        header: () => <span className="sr-only">Ações</span>,
        cell: (ctx) => (
          <div className="text-right">
            <Button variant="link" className="h-auto p-0 text-foreground" asChild>
              <Link href={`/glosas/${ctx.row.original.id}`}>Abrir</Link>
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
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Glosas</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Registro por medição (atraso, não entrega, SLA, qualidade). Use <strong className="font-medium text-foreground">Nova glosa</strong>{" "}
            para lançar valores; a lista atualiza ao guardar.
          </p>
        </div>
        <Button type="button" className="shrink-0 gap-2" onClick={() => setModalOpen(true)}>
          <Receipt className="h-4 w-4" />
          Nova glosa
        </Button>
      </div>

      <section className="overflow-hidden rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <DataTable
          columns={columns}
          data={glosas}
          searchPlaceholder="Pesquisar medição, tipo…"
          emptyLabel='Nenhuma glosa ainda. Clique em "Nova glosa" após calcular a medição.'
        />
      </section>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nova glosa"
        description="A glosa deve estar associada a uma medição já calculada. Indique valor e justificativa."
      >
        <GlosaForm
          measurementOptions={measurementOptions}
          onSuccess={() => {
            setModalOpen(false);
            void qc.invalidateQueries({ queryKey: queryKeys.glosas });
          }}
        />
      </Modal>
    </div>
  );
}
