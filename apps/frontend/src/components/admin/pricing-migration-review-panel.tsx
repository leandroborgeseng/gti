"use client";

import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { PricingMigrationReviewContract } from "@/lib/api";
import { getPricingMigrationReview } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable } from "@/components/tables/data-table";

type ReviewFilter = "all" | "migrated" | "pending" | "inconsistent";

const columnHelper = createColumnHelper<PricingMigrationReviewContract>();
const INCONSISTENT_FLAGS = new Set(["MULTIPLE_MENSALIDADE", "QTY_UNDEFINED", "PERIOD_UNDEFINED", "VALUE_DIVERGENCE"]);

const FLAG_LABELS: Record<string, string> = {
  MIGRATED: "Migrado",
  PENDING: "Pendente",
  MULTIPLE_MENSALIDADE: "Múltiplas mensalidades",
  QTY_UNDEFINED: "Quantidade a revisar",
  PERIOD_UNDEFINED: "Período a revisar",
  VALUE_DIVERGENCE: "Valor divergente"
};

function formatCurrency(value: number | null): string {
  if (value == null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function FlagList({ flags }: { flags: string[] }): JSX.Element {
  if (!flags.length) return <span className="text-muted-foreground">Sem apontamentos</span>;
  return (
    <div className="flex max-w-72 flex-wrap gap-1">
      {flags.map((flag) => (
        <span
          key={flag}
          className={
            flag === "PENDING" || INCONSISTENT_FLAGS.has(flag)
              ? "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900"
              : "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900"
          }
        >
          {FLAG_LABELS[flag] ?? flag}
        </span>
      ))}
    </div>
  );
}

export function PricingMigrationReviewPanel(): JSX.Element {
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const { data, error, isLoading } = useQuery({
    queryKey: queryKeys.pricingMigrationReview,
    queryFn: getPricingMigrationReview
  });

  const contracts = useMemo(() => {
    const rows = data?.contracts ?? [];
    if (filter === "migrated") return rows.filter((row) => row.flags.includes("MIGRATED"));
    if (filter === "pending") return rows.filter((row) => row.flags.includes("PENDING"));
    if (filter === "inconsistent") return rows.filter((row) => row.flags.some((flag) => INCONSISTENT_FLAGS.has(flag)));
    return rows;
  }, [data?.contracts, filter]);

  const columns = useMemo<ColumnDef<PricingMigrationReviewContract, any>[]>(
    () => [
      columnHelper.accessor("number", {
        header: "Contrato",
        cell: (info) => (
          <div>
            <span className="font-medium">{info.getValue()}</span>
            <p className="max-w-56 truncate text-xs text-muted-foreground">{info.row.original.name}</p>
          </div>
        )
      }),
      columnHelper.display({
        id: "valores",
        header: "Valores legados",
        cell: (info) => (
          <div className="text-xs">
            <p>Mensal: {formatCurrency(info.row.original.monthlyValue)}</p>
            <p>Implantação: {formatCurrency(info.row.original.installationValue)}</p>
          </div>
        )
      }),
      columnHelper.display({
        id: "itens",
        header: "Itens ativos",
        cell: (info) => (
          <div className="text-xs">
            <p>{info.row.original.pricingItemsCount} no total</p>
            <p className="text-muted-foreground">
              {info.row.original.mensalidadeCount} mensalidade(s) · {info.row.original.implantacaoCount} implantação(ões)
            </p>
          </div>
        )
      }),
      columnHelper.accessor("flags", {
        header: "Conferência",
        cell: (info) => <FlagList flags={info.getValue()} />
      }),
      columnHelper.display({
        id: "actions",
        header: () => <span className="flex w-full justify-end">Ações</span>,
        cell: (info) => (
          <div className="flex justify-end">
            <Button asChild variant="outline" size="sm">
              <Link href={`/contracts/${info.row.original.id}`}>Abrir contrato</Link>
            </Button>
          </div>
        )
      })
    ],
    []
  );
  const loadError = error instanceof Error ? error.message : error ? String(error) : null;

  return (
    <div className="space-y-4">
      {loadError ? <DataLoadAlert messages={[loadError]} title="Não foi possível carregar a conferência" /> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Valide a migração dos valores mensais e de implantação para os itens contratuais ativos.
          </p>
          {data ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {data.summary.totalActive} ativos · {data.summary.migrated} migrados · {data.summary.pending} pendentes ·{" "}
              {data.summary.inconsistent} com inconsistências
            </p>
          ) : null}
        </div>
        <Select value={filter} onValueChange={(value) => setFilter(value as ReviewFilter)}>
          <SelectTrigger className="w-[190px]">
            <SelectValue placeholder="Filtrar conferência" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os contratos</SelectItem>
            <SelectItem value="migrated">Migrados</SelectItem>
            <SelectItem value="pending">Pendentes</SelectItem>
            <SelectItem value="inconsistent">Com inconsistências</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <section className="overflow-hidden rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando conferência…</p>
        ) : (
          <DataTable
            columns={columns}
            data={contracts}
            searchPlaceholder="Pesquisar número ou nome do contrato…"
            emptyLabel="Nenhum contrato encontrado para este filtro."
          />
        )}
      </section>
    </div>
  );
}
