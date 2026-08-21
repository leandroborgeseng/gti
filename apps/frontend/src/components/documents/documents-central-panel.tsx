"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  getMyContractNotifications,
  type ContractNotificationRecord
} from "@/lib/api";
import { useAuthMe } from "@/hooks/use-auth-me";
import { queryKeys } from "@/lib/query-keys";
import { Card } from "@/components/ui/card";
import { InlineLoading } from "@/components/ui/inline-loading";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type QuickFilter = "PENDING_MY_SIGNATURE" | "SIGNED_BY_ME" | "CREATED_BY_ME" | "ALL";

type Props = {
  /** Área externa usa detalhe em /externo/notificacoes/:id */
  mode: "internal" | "external";
};

/**
 * Central de Documentos (tickets 103/104) — notificações formalizadas.
 */
export function DocumentsCentralPanel({ mode }: Props): JSX.Element {
  const [filter, setFilter] = useState<QuickFilter>("ALL");
  const me = useAuthMe();
  const userId = me.data?.id ?? null;

  const q = useQuery({
    queryKey: queryKeys.contractNotifications(`docs-central-${mode}`),
    queryFn: () => getMyContractNotifications()
  });

  const items = (q.data ?? []) as ContractNotificationRecord[];
  const filtered = useMemo(() => {
    return items.filter((n) => {
      if (filter === "ALL") return true;
      const signers = n.signers ?? [];
      if (filter === "PENDING_MY_SIGNATURE") {
        if (!userId) return false;
        return signers.some((s) => s.userId === userId && !s.signedAt);
      }
      if (filter === "SIGNED_BY_ME") {
        if (!userId) return false;
        return signers.some((s) => s.userId === userId && Boolean(s.signedAt));
      }
      if (filter === "CREATED_BY_ME") {
        if (!userId) return false;
        return n.createdById === userId;
      }
      return true;
    });
  }, [items, filter, userId]);

  function openHref(n: ContractNotificationRecord): string {
    if (mode === "external") return `/externo/notificacoes/${n.id}`;
    return `/contracts/${n.contractId}?tab=notificacoes`;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Documentos</h1>
        <p className="text-sm text-muted-foreground">
          Visão central dos documentos formais. A aba Notificações do contrato continua como visão contextual do
          mesmo registro.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={filter} onValueChange={(v) => setFilter(v as QuickFilter)}>
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
      ) : filtered.length === 0 ? (
        <Card className="p-4 text-sm text-muted-foreground">Nenhum documento encontrado neste filtro.</Card>
      ) : (
        <ul className="space-y-2">
          {filtered.map((n) => (
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
    </div>
  );
}
