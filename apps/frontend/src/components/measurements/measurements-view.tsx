"use client";

import type { Route } from "next";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardPlus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Measurement, PagedList } from "@/lib/api";
import { getMeasurements } from "@/lib/api";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { queryKeys } from "@/lib/query-keys";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/tables/data-table";
import dynamic from "next/dynamic";

const MeasurementForm = dynamic(
  () => import("@/components/actions/measurement-form").then((m) => ({ default: m.MeasurementForm })),
  { ssr: false }
);

const statusLabel: Record<string, string> = {
  OPEN: "Aberta",
  UNDER_REVIEW: "Em revisão",
  APPROVED: "Aprovada",
  GLOSSED: "Glosada"
};

const columnHelper = createColumnHelper<Measurement>();

type ContractOption = { id: string; number: string; name: string };

type Props = {
  initialPage?: PagedList<Measurement>;
  contractOptions?: ContractOption[];
  filterContractId?: string;
  filterContractTitle?: string;
  dataLoadErrors?: string[];
};

export function MeasurementsView({
  initialPage,
  contractOptions,
  filterContractId,
  filterContractTitle,
  dataLoadErrors = []
}: Props): JSX.Element {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 200);

  useEffect(() => {
    setPageIndex(0);
  }, [debouncedSearch, filterContractId, pageSize]);

  const filterKey = JSON.stringify({
    page: pageIndex + 1,
    pageSize,
    q: debouncedSearch.trim(),
    contractId: filterContractId ?? ""
  });

  const qPage = useQuery({
    queryKey: queryKeys.measurementsList(filterKey),
    queryFn: () =>
      getMeasurements({
        page: pageIndex + 1,
        pageSize,
        q: debouncedSearch.trim() || undefined,
        contractId: filterContractId
      }),
    placeholderData: (prev) => prev,
    initialData:
      pageIndex === 0 && !debouncedSearch.trim() && initialPage && !filterContractId
        ? initialPage
        : filterContractId && pageIndex === 0 && !debouncedSearch.trim() && initialPage
          ? initialPage
          : undefined
  });

  const pageData = qPage.data;
  const rows = pageData?.items ?? [];
  const total = pageData?.total ?? 0;
  const pageCount = pageData?.pageCount ?? 0;

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
            Lista das medições por contrato e competência (uma por mês). O{" "}
            <strong className="font-medium text-foreground">estado</strong> (Aberta → Em revisão / Glosada → Aprovada)
            fica registrado após calcular e aprovar. Use{" "}
            <strong className="font-medium text-foreground">Nova medição</strong> para cada fechamento mensal.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            <Link
              href={"/reports/fechamento-mensal" as Route}
              className="font-medium text-foreground underline decoration-muted-foreground underline-offset-2 hover:decoration-foreground"
            >
              Relatório de fechamento mensal
            </Link>
            {" · "}
            Pagamentos por medição aprovada, valor de referência do mês anterior e OS GLPI (abertas, fechadas e represadas)
            por contrato.
          </p>
          {filterContractId ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              <span>
                Filtrando por contrato:{" "}
                <strong className="font-medium text-foreground">{filterContractTitle ?? filterContractId}</strong> ({total}{" "}
                {total === 1 ? "registro" : "registros"}).
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
        <DataTable
          columns={columns}
          data={rows}
          searchPlaceholder="Pesquisar contrato…"
          emptyLabel={emptyLabel}
          pageSizeOptions={[10, 25, 50, 100]}
          manualPagination
          pageCount={pageCount}
          rowCount={total}
          pagination={{ pageIndex, pageSize }}
          onPaginationChange={(next) => {
            setPageIndex(next.pageIndex);
            setPageSize(next.pageSize);
          }}
          searchValue={search}
          onSearchChange={setSearch}
          isFetching={qPage.isFetching}
        />
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
