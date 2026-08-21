"use client";

import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Glosa, PagedList } from "@/lib/api";
import { getGlosas } from "@/lib/api";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { queryKeys } from "@/lib/query-keys";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
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
  initialPage?: PagedList<Glosa>;
  dataLoadErrors?: string[];
};

export function GlosasView({ initialPage, dataLoadErrors = [] }: Props): JSX.Element {
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 200);

  useEffect(() => {
    setPageIndex(0);
  }, [debouncedSearch, pageSize]);

  const filterKey = JSON.stringify({ page: pageIndex + 1, pageSize, q: debouncedSearch.trim() });

  const qPage = useQuery({
    queryKey: queryKeys.glosasList(filterKey),
    queryFn: () =>
      getGlosas({
        page: pageIndex + 1,
        pageSize,
        q: debouncedSearch.trim() || undefined
      }),
    placeholderData: (prev) => prev,
    initialData: pageIndex === 0 && !debouncedSearch.trim() ? initialPage : undefined
  });

  const rows = qPage.data?.items ?? [];
  const total = qPage.data?.total ?? 0;
  const pageCount = qPage.data?.pageCount ?? 0;

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
          cell: (info) => <span className="text-xs text-muted-foreground">{info.getValue()}</span>
        }
      ),
      columnHelper.accessor((row) => row.measurement?.contract?.internalCode ?? row.measurement?.contract?.number ?? "-", {
        id: "contract",
        header: "Contrato",
        cell: (info) => (
          <span className="max-w-[140px] truncate text-xs text-muted-foreground" title={String(info.getValue())}>
            {String(info.getValue())}
          </span>
        )
      }),
      columnHelper.accessor("type", {
        header: "Tipo",
        cell: (info) => <span className="text-foreground">{typeLabel[info.getValue()] ?? info.getValue()}</span>
      }),
      columnHelper.accessor((row) => row.origin ?? "MANUAL", {
        id: "origin",
        header: "Origem",
        cell: (info) => (
          <span className="text-muted-foreground">{info.getValue() === "AUTOMATIC" ? "Automática" : "Manual"}</span>
        )
      }),
      columnHelper.accessor("value", {
        header: () => <span className="flex w-full justify-end">Valor</span>,
        cell: (info) => <div className="text-right tabular-nums text-foreground">{info.getValue()}</div>
      }),
      columnHelper.accessor("createdBy", {
        header: "Responsável",
        cell: (info) => <span className="text-muted-foreground">{info.getValue()}</span>
      }),
      columnHelper.accessor("createdAt", {
        header: "Data",
        cell: (info) => (
          <span className="whitespace-nowrap text-muted-foreground">
            {new Date(info.getValue()).toLocaleDateString("pt-BR")}
          </span>
        )
      }),
      columnHelper.display({
        id: "actions",
        enableSorting: false,
        header: () => <span className="sr-only">Ações</span>,
        cell: (ctx) => {
          const measurementId = ctx.row.original.measurementId;
          return (
            <div className="text-right">
              <Button variant="link" className="h-auto p-0 text-foreground" asChild>
                <Link href={measurementId ? `/measurements/${measurementId}` : `/glosas/${ctx.row.original.id}`}>
                  Abrir medição
                </Link>
              </Button>
            </div>
          );
        }
      })
    ],
    []
  );

  return (
    <div className="space-y-6">
      {dataLoadErrors.length > 0 ? <DataLoadAlert messages={dataLoadErrors} /> : null}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Glosas</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Área consolidada de consulta e acompanhamento. A glosa é uma dedução da medição, não um lançamento financeiro
          isolado. Novas glosas adicionais devem ser registradas dentro da medição correspondente.
        </p>
      </div>

      <section className="overflow-hidden rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <DataTable
          columns={columns}
          data={rows}
          searchPlaceholder="Pesquisar medição, contrato, tipo…"
          emptyLabel="Nenhuma glosa registrada nas medições."
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
    </div>
  );
}
