"use client";

import type { Route } from "next";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardPlus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Measurement } from "@/lib/api";
import { getMeasurements } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { MeasurementForm } from "@/components/actions/measurement-form";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/tables/data-table";

const statusLabel: Record<string, string> = {
  OPEN: "Aberta",
  UNDER_REVIEW: "Em revisão",
  APPROVED: "Aprovada",
  GLOSSED: "Glosada"
};

const columnHelper = createColumnHelper<Measurement>();

type ContractOption = { id: string; number: string; name: string };

type Props = {
  measurements: Measurement[];
  contractOptions?: ContractOption[];
  filterContractId?: string;
  filterContractTitle?: string;
  dataLoadErrors?: string[];
};

export function MeasurementsView({
  measurements: initialMeasurements,
  contractOptions,
  filterContractId,
  filterContractTitle,
  dataLoadErrors = []
}: Props): JSX.Element {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);

  const { data: measurements = initialMeasurements } = useQuery({
    queryKey: queryKeys.measurements,
    queryFn: getMeasurements,
    initialData: initialMeasurements
  });

  const rows = useMemo(
    () => (filterContractId ? measurements.filter((m) => m.contractId === filterContractId) : measurements),
    [measurements, filterContractId]
  );

  const columns = useMemo<ColumnDef<Measurement, any>[]>(
    () => [
      columnHelper.accessor((row) => row.contract?.name ?? row.contractId, {
        id: "contract",
        header: "Contrato",
        cell: (info) => <span className="text-foreground">{info.getValue()}</span>
      }),
      columnHelper.accessor((row) => `${String(row.referenceMonth).padStart(2, "0")}/${row.referenceYear}`, {
        id: "reference",
        header: "Referência",
        cell: (info) => <span className="whitespace-nowrap tabular-nums text-muted-foreground">{info.getValue()}</span>
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: (info) => (
          <Badge variant="secondary" className="font-normal">
            {statusLabel[info.getValue()] ?? info.getValue()}
          </Badge>
        )
      }),
      columnHelper.accessor("totalApprovedValue", {
        header: () => <span className="flex w-full justify-end">Valor aprovado</span>,
        cell: (info) => (
          <div className="whitespace-nowrap text-right tabular-nums text-foreground">
            R${" "}
            {Number(info.getValue()).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        )
      }),
      columnHelper.display({
        id: "actions",
        enableSorting: false,
        header: () => <span className="sr-only">Ações</span>,
        cell: (ctx) => (
          <div className="text-right">
            <Button variant="link" className="h-auto p-0 text-foreground" asChild>
              <Link href={`/measurements/${ctx.row.original.id}` as Route}>Abrir</Link>
            </Button>
          </div>
        )
      })
    ],
    []
  );

  const emptyLabel = filterContractId
    ? "Nenhuma medição para este contrato (ou o contrato não existe)."
    : 'Nenhuma medição ainda. Clique em "Nova medição" para cadastrar.';

  return (
    <div className="space-y-6">
      {dataLoadErrors.length > 0 ? <DataLoadAlert messages={dataLoadErrors} /> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Medições</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Lista das medições por contrato e competência (uma por mês). O <strong className="font-medium text-foreground">estado</strong>{" "}
            (Aberta → Em revisão / Glosada → Aprovada) fica registado após calcular e aprovar. Use{" "}
            <strong className="font-medium text-foreground">Nova medição</strong> para cada fechamento mensal.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            <Link
              href={"/reports/fechamento-mensal" as Route}
              className="font-medium text-foreground underline decoration-muted-foreground underline-offset-2 hover:decoration-foreground"
            >
              Relatório de fechamento mensal
            </Link>{" "}
            — pagamentos por medição aprovada, valor de referência do mês anterior e OS GLPI (abertas, fechadas e represadas) por contrato.
          </p>
          {filterContractId ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              <span>
                Filtrando por contrato: <strong className="font-medium text-foreground">{filterContractTitle ?? filterContractId}</strong>{" "}
                ({rows.length} {rows.length === 1 ? "registro" : "registros"}).
              </span>
              <Link
                href={"/measurements" as Route}
                className="font-medium text-foreground underline decoration-muted-foreground underline-offset-2 hover:decoration-foreground"
              >
                Limpar filtro
              </Link>
            </div>
          ) : null}
        </div>
        <Button type="button" className="shrink-0 gap-2" onClick={() => setModalOpen(true)}>
          <ClipboardPlus className="h-4 w-4" />
          Nova medição
        </Button>
      </div>

      <section className="overflow-hidden rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <DataTable columns={columns} data={rows} searchPlaceholder="Pesquisar contrato, referência…" emptyLabel={emptyLabel} />
      </section>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nova medição"
        description="Informe o contrato e a competência (mês/ano). Depois pode calcular e aprovar na página da medição."
      >
        <MeasurementForm
          contractOptions={contractOptions}
          defaultContractId={filterContractId}
          onSuccess={() => {
            setModalOpen(false);
            void qc.invalidateQueries({ queryKey: queryKeys.measurements });
          }}
        />
      </Modal>
    </div>
  );
}
