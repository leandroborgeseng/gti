"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getMyContractNotifications, type ContractNotificationRecord } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { Card } from "@/components/ui/card";
import { InlineLoading } from "@/components/ui/inline-loading";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

type QuickFilter = "PENDING_MY_SIGNATURE" | "SIGNED_BY_ME" | "CREATED_BY_ME" | "ALL";

type Props = {
  /** Área externa usa detalhe em /externo/notificacoes/:id */
  mode: "internal" | "external";
};

const PAGE_SIZES = [10, 25, 50, 100] as const;

/**
 * Central de Documentos (tickets 103/104) — notificações formalizadas.
 */
export function DocumentsCentralPanel({ mode }: Props): JSX.Element {
  const [filter, setFilter] = useState<QuickFilter>("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);

  useEffect(() => {
    setPage(1);
  }, [filter, pageSize]);

  const q = useQuery({
    queryKey: queryKeys.contractNotifications(`docs-central-${mode}-${filter}-${page}-${pageSize}`),
    queryFn: () => getMyContractNotifications({ page, pageSize, filter })
  });

  const items = (q.data?.items ?? []) as ContractNotificationRecord[];
  const total = q.data?.total ?? 0;
  const pageCount = q.data?.pageCount ?? 0;

  function openHref(n: ContractNotificationRecord): string {
    if (mode === "external") return `/externo/notificacoes/${n.id}`;
    return `/contracts/${n.contractId}?tab=notificacoes`;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Documentos</h1>
        <p className="text-sm text-muted-foreground">
          Visão central dos documentos formais. A aba Notificações do contrato continua como visão contextual do mesmo
          registro.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={filter}
          onValueChange={(v) => {
            setFilter(v as QuickFilter);
          }}
        >
          <SelectTrigger className="w-[260px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos que posso acessar</SelectItem>
            <SelectItem value="PENDING_MY_SIGNATURE">Pendentes de minha assinatura</SelectItem>
            <SelectItem value="SIGNED_BY_ME">Assinados por mim</SelectItem>
            <SelectItem value="CREATED_BY_ME">Elaborados por mim</SelectItem>
          </SelectContent>
        </Select>
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
          aria-label="Itens por página"
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n} / página
            </option>
          ))}
        </select>
        {mode === "external" ? (
          <Link href="/externo/notificacoes" className="text-sm underline">
            Abrir listagem clássica de notificações
          </Link>
        ) : null}
      </div>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">
          <InlineLoading label="Carregando documentos…" />
        </p>
      ) : items.length === 0 ? (
        <Card className="p-4 text-sm text-muted-foreground">Nenhum documento encontrado neste filtro.</Card>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li key={n.id}>
              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">{n.number}</p>
                    <p className="text-sm text-slate-700">{n.subject}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Tipo: Notificação contratual · Situação: {n.status}
                      {n.contract?.name ? ` · ${n.contract.name}` : null}
                    </p>
                  </div>
                  <Link href={openHref(n)} className="text-sm font-medium underline">
                    Abrir
                  </Link>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {pageCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <p>
            Página {page} de {pageCount || 1} · {total} {total === 1 ? "documento" : "documentos"}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={page <= 1 || q.isFetching} onClick={() => setPage(1)}>
              Primeira
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1 || q.isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pageCount === 0 || page >= pageCount || q.isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              Seguinte
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pageCount === 0 || page >= pageCount || q.isFetching}
              onClick={() => setPage(pageCount)}
            >
              Última
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
