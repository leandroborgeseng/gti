"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { createContractFinancialSnapshot, type ContractFinancialSnapshot } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { formatBrl } from "@/lib/format-brl";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  contractId: string;
  snapshots: ContractFinancialSnapshot[] | undefined;
  currentMonthly: string;
};

function parseMoney(s: string): number {
  return Number(String(s).replace(",", "."));
}

export function ContractFinancialSnapshotsPanel({ contractId, snapshots, currentMonthly }: Props): JSX.Element {
  const router = useRouter();
  const [note, setNote] = useState("");
  const list = snapshots ?? [];
  const latest = list[0];
  const curMv = parseMoney(currentMonthly);
  const prevMv = latest ? parseMoney(latest.monthlyValue) : NaN;
  const deltaMv =
    latest && Number.isFinite(curMv) && Number.isFinite(prevMv) ? curMv - prevMv : null;

  const mut = useMutation({
    mutationFn: () => createContractFinancialSnapshot(contractId, note.trim() ? { note: note.trim() } : {}),
    onSuccess: () => {
      toast.success("Memória financeira registada com os valores vigentes neste momento.");
      setNote("");
      router.refresh();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Erro ao registar memória");
    }
  });

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Histórico financeiro (renovação)</h2>
        <p className="mt-1 text-xs text-slate-600">
          Use «Registar memória» <strong>antes</strong> de alterar valores no cadastro ou por aditivo, para guardar o
          estado actual (mensalidade, total e implantação). Depois pode comparar com os valores novos.
        </p>
      </div>

      {deltaMv !== null && latest ? (
        <p className="rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-950">
          <span className="font-medium">Última memória → valores actuais (mensalidade):</span>{" "}
          {formatBrl(latest.monthlyValue)} → {formatBrl(currentMonthly)}
          <span className="whitespace-nowrap">
            {" "}
            ({deltaMv >= 0 ? "+" : ""}
            {formatBrl(deltaMv)})
          </span>
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-1">
          <label className="text-xs font-medium text-slate-700" htmlFor="financial-snapshot-note">
            Nota (opcional)
          </label>
          <Textarea
            id="financial-snapshot-note"
            rows={2}
            className="resize-none text-sm"
            placeholder="Ex.: antes da renovação 2026"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={mut.isPending}
          />
        </div>
        <Button type="button" disabled={mut.isPending} onClick={() => mut.mutate()}>
          {mut.isPending ? "A registar…" : "Registar memória"}
        </Button>
      </div>

      {list.length === 0 ? (
        <p className="text-xs text-slate-500">Ainda não há registos de memória financeira para este contrato.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
          <table className="w-full min-w-[520px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100/80 text-slate-700">
                <th className="px-2 py-2 font-medium">Data</th>
                <th className="px-2 py-2 font-medium">Mensalidade</th>
                <th className="px-2 py-2 font-medium">Total</th>
                <th className="px-2 py-2 font-medium">Implantação</th>
                <th className="px-2 py-2 font-medium">Nota</th>
              </tr>
            </thead>
            <tbody>
              {list.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-0">
                  <td className="whitespace-nowrap px-2 py-2 text-slate-800">
                    {new Date(row.recordedAt).toLocaleString("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short"
                    })}
                  </td>
                  <td className="px-2 py-2 text-slate-800">{formatBrl(row.monthlyValue)}</td>
                  <td className="px-2 py-2 text-slate-800">{formatBrl(row.totalValue)}</td>
                  <td className="px-2 py-2 text-slate-800">{formatBrl(row.installationValue)}</td>
                  <td className="max-w-[200px] truncate px-2 py-2 text-slate-600" title={row.note ?? undefined}>
                    {row.note?.trim() ? row.note : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
