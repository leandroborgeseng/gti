"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getContracts } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { Card } from "@/components/ui/card";

export default function ExternoContratosPage(): JSX.Element {
  const q = useQuery({ queryKey: queryKeys.contracts, queryFn: getContracts, staleTime: 60_000 });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Meus contratos</h1>
        <p className="text-sm text-muted-foreground">
          Contratos da sua empresa aos quais você está autorizado. O acesso é limitado a estes vínculos.
        </p>
      </div>
      <Card className="divide-y">
        {(q.data ?? []).map((c) => (
          <div key={c.id} className="px-4 py-3 text-sm">
            <p className="font-medium">
              {c.internalCode ?? c.number} — {c.name}
            </p>
            <p className="text-xs text-muted-foreground">{c.companyName}</p>
            <Link href={`/contracts/${c.id}`} className="mt-1 inline-block text-xs underline">
              Abrir ficha (visão limitada)
            </Link>
          </div>
        ))}
        {!q.isLoading && (q.data ?? []).length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Nenhum contrato autorizado.</p>
        ) : null}
      </Card>
    </div>
  );
}
