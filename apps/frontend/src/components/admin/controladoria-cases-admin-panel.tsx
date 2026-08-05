"use client";

import type { Route } from "next";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { listAllControladoriaCases, type ContractControladoriaCaseStatus } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { DataLoadAlert } from "@/components/ui/data-load-alert";

const CASE_STATUS_LABEL: Record<ContractControladoriaCaseStatus, string> = {
  EM_PREPARACAO: "Em preparação",
  ENCAMINHADO: "Encaminhado",
  RECEBIDO_CONTROLADORIA: "Recebido na Controladoria",
  COMPLEMENTACAO_SOLICITADA: "Complementação solicitada",
  EM_INSTRUCAO: "Em instrução",
  AGUARDANDO_DEFESA: "Aguardando defesa",
  EM_ANALISE: "Em análise",
  AGUARDANDO_DECISAO: "Aguardando decisão",
  EM_RECURSO: "Em recurso",
  CONCLUIDO: "Concluído",
  ARQUIVADO: "Arquivado"
};

function formatDateBr(value?: string | null): string {
  if (!value) return "-";
  const raw = String(value).slice(0, 10);
  const [y, m, d] = raw.split("-");
  if (!y || !m || !d) return raw;
  return `${d}/${m}/${y}`;
}

export function ControladoriaCasesAdminPanel(): JSX.Element {
  const { data, isLoading, error } = useQuery({
    queryKey: ["controladoria-cases", "admin"],
    queryFn: () => listAllControladoriaCases(200)
  });

  return (
    <div className="space-y-4">
      <Card className="space-y-2 p-5">
        <h2 className="text-lg font-semibold text-foreground">Casos na Controladoria</h2>
        <p className="text-sm text-muted-foreground">
          Listagem simples dos dossiês encaminhados a partir de ocorrências contratuais. O detalhe e o
          acompanhamento do processo ficam na ficha do contrato correspondente.
        </p>
      </Card>

      {error ? (
        <DataLoadAlert
          title="Não foi possível carregar os casos"
          messages={[error instanceof Error ? error.message : "Erro ao carregar"]}
        />
      ) : null}

      {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : null}

      {!isLoading && (data?.length ?? 0) === 0 ? (
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Nenhum caso encaminhado até o momento.</p>
        </Card>
      ) : null}

      {(data ?? []).length > 0 ? (
        <Card className="overflow-x-auto p-0">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Contrato</th>
                <th className="px-4 py-3 font-semibold">Ocorrência</th>
                <th className="px-4 py-3 font-semibold">Situação</th>
                <th className="px-4 py-3 font-semibold">Processo</th>
                <th className="px-4 py-3 font-semibold">Abertura</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((row) => (
                <tr key={row.id} className="border-b border-border/70 last:border-0">
                  <td className="px-4 py-3 align-top">
                    {row.contract ? (
                      <Link
                        href={`/contracts/${row.contract.id}` as Route}
                        className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                      >
                        {row.contract.internalCode || row.contract.number}
                      </Link>
                    ) : (
                      "-"
                    )}
                    {row.contract?.name ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">{row.contract.name}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <p className="text-foreground">{row.occurrence?.title ?? "-"}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{row.summary}</p>
                  </td>
                  <td className="px-4 py-3 align-top text-foreground">
                    {CASE_STATUS_LABEL[row.status] ?? row.status}
                  </td>
                  <td className="px-4 py-3 align-top text-foreground">
                    {row.processNumber || "-"}
                    {row.seiNumber ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">SEI: {row.seiNumber}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 align-top text-foreground">{formatDateBr(row.openedAt ?? row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </div>
  );
}
