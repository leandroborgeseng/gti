"use client";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export type DataTableProps<TData> = {
  /** Colunas da TanStack Table; `TValue` em `ColumnDef` pode variar por coluna, por isso usamos `any` aqui. */
  columns: ColumnDef<TData, any>[];
  data: TData[];
  /** Placeholder do campo de pesquisa (filtro global em todas as células visíveis). */
  searchPlaceholder?: string;
  /** Classe extra no wrapper. */
  className?: string;
  /** Linha vazia quando não há dados após filtro. */
  emptyLabel?: string;
  /** Tamanhos de página sugeridos (primeiro é o inicial). */
  pageSizeOptions?: number[];
  /** Paginação no servidor: a `data` já é a página atual. */
  manualPagination?: boolean;
  pageCount?: number;
  rowCount?: number;
  pagination?: { pageIndex: number; pageSize: number };
  onPaginationChange?: (next: { pageIndex: number; pageSize: number }) => void;
  onSearchChange?: (value: string) => void;
  searchValue?: string;
  isFetching?: boolean;
};

function defaultGlobalFilter<TData>(row: { original: TData }, _columnId: string, filterValue: unknown): boolean {
  const q = String(filterValue ?? "")
    .trim()
    .toLowerCase();
  if (!q) return true;
  try {
    return JSON.stringify(row.original).toLowerCase().includes(q);
  } catch {
    return true;
  }
}

export function DataTable<TData>({
  columns,
  data,
  searchPlaceholder = "Pesquisar…",
  className,
  emptyLabel = "Nenhum registro encontrado.",
  pageSizeOptions = [10, 25, 50, 100],
  manualPagination = false,
  pageCount: pageCountProp,
  rowCount,
  pagination: paginationProp,
  onPaginationChange,
  onSearchChange,
  searchValue,
  isFetching = false
}: DataTableProps<TData>): JSX.Element {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [internalSearch, setInternalSearch] = useState("");
  const globalFilter = searchValue ?? internalSearch;
  const debouncedGlobal = useDebouncedValue(globalFilter, 200);
  const [internalPagination, setInternalPagination] = useState({
    pageIndex: 0,
    pageSize: pageSizeOptions[0] ?? 10
  });
  const pagination = paginationProp ?? internalPagination;

  const filteredData = useMemo(() => {
    if (manualPagination) return data;
    const q = debouncedGlobal.trim().toLowerCase();
    if (!q) return data;
    return data.filter((row) => defaultGlobalFilter({ original: row }, "", q));
  }, [data, debouncedGlobal, manualPagination]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, columnFilters, pagination },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: (updater) => {
      const next = typeof updater === "function" ? updater(pagination) : updater;
      if (onPaginationChange) onPaginationChange(next);
      else setInternalPagination(next);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: manualPagination ? undefined : getPaginationRowModel(),
    manualPagination,
    pageCount: manualPagination ? pageCountProp ?? 0 : undefined,
    rowCount: manualPagination ? rowCount : undefined
  });

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={globalFilter}
            onChange={(e) => {
              const v = e.target.value;
              if (searchValue === undefined) setInternalSearch(v);
              else onSearchChange?.(v);
              if (!manualPagination) table.setPageIndex(0);
            }}
            placeholder={searchPlaceholder}
            className="pl-9"
            aria-label="Pesquisa na tabela"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="tabular-nums">
            {manualPagination
              ? `${rowCount ?? 0} ${(rowCount ?? 0) === 1 ? "linha" : "linhas"}`
              : `${table.getFilteredRowModel().rows.length} ${table.getFilteredRowModel().rows.length === 1 ? "linha" : "linhas"}`}
            {isFetching ? "…" : ""}
          </span>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
            value={table.getState().pagination.pageSize}
            onChange={(e) => {
              table.setPageSize(Number(e.target.value));
              table.setPageIndex(0);
            }}
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n} / página
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id} className="whitespace-nowrap">
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        className="inline-flex cursor-pointer select-none items-center gap-1 font-medium text-muted-foreground hover:text-foreground"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === "asc" ? " ↑" : null}
                        {header.column.getIsSorted() === "desc" ? " ↓" : null}
                      </button>
                    ) : (
                      <span className="font-medium text-muted-foreground">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </span>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  {emptyLabel}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount() || 1}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Seguinte
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
