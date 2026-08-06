"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getMyContractNotifications } from "@/lib/api";
import { Card } from "@/components/ui/card";

export default function ExternoNotificacoesPage(): JSX.Element {
  const q = useQuery({
    queryKey: ["my-contract-notifications"],
    queryFn: getMyContractNotifications
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Notificações</h1>
        <p className="text-sm text-muted-foreground">
          Notificações formais dos contratos autorizados à sua empresa. Dê ciência e elabore manifestações quando
          solicitado.
        </p>
      </div>
      <Card className="divide-y">
        {(q.data ?? []).map((n) => (
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
        {!q.isLoading && (q.data ?? []).length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Nenhuma notificação disponível.</p>
        ) : null}
      </Card>
    </div>
  );
}
