"use client";

import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  getIdentificationMigrationReview,
  repairIdentificationMigration,
  type IdentificationIssue,
  type IdentificationMigrationReviewContract
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable } from "@/components/tables/data-table";
import { toast } from "sonner";

type ReviewFilter = "all" | IdentificationIssue;

const columnHelper = createColumnHelper<IdentificationMigrationReviewContract>();

const ISSUE_LABELS: Record<IdentificationIssue, string> = {
  MISSING_FORMAL_NUMBER: "Número formal ausente",
  MISSING_CONTRACT_TYPE: "Tipo de contrato não identificado",
  MISSING_ADMIN_PROCESS: "Processo administrativo não informado",
  MISSING_HIRING_TYPE: "Tipo de contratação pendente",
  MISSING_START_DATE: "Início de vigência ausente",
  YEAR_MISMATCH: "Ano do código interno diverge da vigência",
  ORGANIZATION_PENDING: "Órgão pendente de vínculo",
  MISSING_INTERNAL_CODE: "Código interno ausente"
};

function IssueList({ issues }: { issues: IdentificationIssue[] }): JSX.Element {
  if (!issues.length) return <span className="text-muted-foreground">Sem apontamentos</span>;
  return (
    <div className="flex max-w-80 flex-wrap gap-1">
      {issues.map((issue) => (
        <span key={issue} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
          {ISSUE_LABELS[issue] ?? issue}
        </span>
      ))}
    </div>
  );
}

function dash(value: string | number | null | undefined): string {
  if (value == null || value === "") return "-";
  return String(value);
}

export function IdentificationMigrationReviewPanel(): JSX.Element {
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const queryClient = useQueryClient();
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: queryKeys.identificationMigrationReview,
    queryFn: getIdentificationMigrationReview
  });

  const repairMut = useMutation({
    mutationFn: repairIdentificationMigration,
    onSuccess: async (result) => {
      toast.success(`Migração segura concluída: ${result.updated} de ${result.scanned} contratos atualizados.`);
      await queryClient.invalidateQueries({ queryKey: queryKeys.identificationMigrationReview });
      await queryClient.invalidateQueries({ queryKey: queryKeys.contracts });
      await refetch();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Falha ao reaplicar migração.");
    }
  });

  const contracts = useMemo(() => {
    const rows = data?.contracts ?? [];
    if (filter === "all") return rows;
    return rows.filter((row) => row.issues.includes(filter));
  }, [data?.contracts, filter]);

  const columns = useMemo<ColumnDef<IdentificationMigrationReviewContract, any>[]>(
    () => [
      columnHelper.display({
        id: "ids",
        header: "Identificação",
        cell: (info) => (
          <div className="space-y-0.5 text-xs">
            <p>
              <span className="text-muted-foreground">Interno:</span>{" "}
              <span className="font-medium">{dash(info.row.original.internalCode)}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Contrato nº:</span>{" "}
              {info.row.original.formalNumber
                ? `${info.row.original.formalNumber}/${info.row.original.contractYear ?? "?"}`
                : "Pendente"}
            </p>
            <p className="max-w-56 truncate text-muted-foreground" title={info.row.original.name}>
              {info.row.original.name}
            </p>
          </div>
        )
      }),
      columnHelper.display({
        id: "catalog",
        header: "Cadastros",
        cell: (info) => (
          <div className="space-y-0.5 text-xs">
            <p>Tipo: {dash(info.row.original.contractTypeName)}</p>
            <p>Contratação: {dash(info.row.original.hiringTypeName)}</p>
            <p>Processo: {dash(info.row.original.administrativeProcess)}</p>
            <p>Órgão: {dash(info.row.original.organizationName)}</p>
          </div>
        )
      }),
      columnHelper.accessor("issues", {
        header: "Conferência",
        cell: (info) => <IssueList issues={info.getValue()} />
      }),
      columnHelper.display({
        id: "actions",
        header: () => <span className="flex w-full justify-end">Ações</span>,
        cell: (info) => (
          <div className="flex justify-end">
            <Button asChild variant="outline" size="sm">
              <Link href={`/contracts/${info.row.original.id}`}>Regularizar</Link>
            </Button>
          </div>
        )
      })
    ],
    []
  );

  const loadError = error instanceof Error ? error.message : error ? String(error) : null;
  const summary = data?.summary;

  return (
    <div className="space-y-4">
      {loadError ? <DataLoadAlert messages={[loadError]} title="Não foi possível carregar a conferência" /> : null}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Contratos com número formal ausente, tipo não identificado, processo administrativo não informado, tipo de
            contratação pendente ou divergência entre o ano do código interno e o início da vigência. A regularização é
            individual: dados incertos não são alterados automaticamente.
          </p>
          {summary ? (
            <p className="text-xs text-muted-foreground">
              {summary.withIssues} com pendências de {summary.total} contratos · {summary.missingFormal} sem nº formal ·{" "}
              {summary.missingType} sem tipo · {summary.yearMismatch} com ano divergente
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select value={filter} onValueChange={(value) => setFilter(value as ReviewFilter)}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Filtrar pendências" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as pendências</SelectItem>
              {(Object.keys(ISSUE_LABELS) as IdentificationIssue[]).map((issue) => (
                <SelectItem key={issue} value={issue}>
                  {ISSUE_LABELS[issue]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="secondary"
            disabled={repairMut.isPending}
            onClick={() => {
              if (
                !confirm(
                  "Reaplicar apenas correções seguras (código interno reconhecível, limpeza de nº formal derivado e vínculo de tipo por sigla)? Números formais não serão inventados."
                )
              ) {
                return;
              }
              repairMut.mutate();
            }}
          >
            {repairMut.isPending ? "Aplicando…" : "Reaplicar migração segura"}
          </Button>
        </div>
      </div>
      <section className="overflow-hidden rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando conferência…</p>
        ) : (
          <DataTable
            columns={columns}
            data={contracts}
            searchPlaceholder="Pesquisar código, nome ou processo…"
            emptyLabel="Nenhum contrato com pendência de identificação para este filtro."
          />
        )}
      </section>
    </div>
  );
}
