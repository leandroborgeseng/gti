"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getMyContractNotifications } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const PAGE_SIZES = [10, 25, 50, 100] as const;

export default function ExternoNotificacoesPage(): JSX.Element {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  const q = useQuery({
    queryKey: [...queryKeys.myContractNotifications, page, pageSize],
    queryFn: () => getMyContractNotifications({ page, pageSize }),
    staleTime: 30_000,
    placeholderData: (prev) => prev
  });
  const items = q.data?.items ?? [];
  const total = q.data?.total ?? 0;
  const pageCount = q.data?.pageCount ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Notificações</h1>
        <p className="text-sm text-muted-foreground">
          Notificações formais dos contratos autorizados à sua empresa. Dê ciência e elabore manifestações quando
          solicitado.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
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
      </div>
      <Card className="divide-y">
        {items.map((n) => (
          <Link
            key={n.id}
            href={`/externo/notificacoes/${n.id}`}
            className="flex items-center justify-between px-4 py-3 text-sm hover:bg-muted/40"
          >
            <span>
              <strong>{n.number}</strong> — {n.subject}
              {n.contract ? (
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {n.contract.internalCode ?? n.contract.number} · {n.contract.name}
                </span>
              ) : null}
            </span>
            <span className="text-xs text-muted-foreground">{n.status}</span>
          </Link>
        ))}
        {!q.isLoading && items.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Nenhuma notificação disponível.</p>
        ) : null}
      </Card>
      {pageCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <p>
            Página {page} de {pageCount || 1} · {total} {total === 1 ? "notificação" : "notificações"}
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
