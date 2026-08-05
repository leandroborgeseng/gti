"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Measurement, MeasurementItemRow } from "@/lib/api";
import { deleteMeasurementItem, patchMeasurementItemQuantity } from "@/lib/api";
import { formatBrl } from "@/lib/format-brl";

const billingLabel: Record<string, string> = {
  RECURRING: "Recorrente",
  ONE_TIME: "Único",
  ON_DEMAND: "Sob demanda"
};

type Props = {
  measurementId: string;
  measurementStatus: string;
  items: MeasurementItemRow[];
  /**
   * Quando definido, sucesso em PATCH/DELETE chama este callback com a medição devolvida pela API
   * e não executa `router.refresh()` (evita recarregar toda a página).
   */
  onMeasurementUpdate?: (measurement: Measurement) => void;
};

function parseQty(s: string): number {
  const n = Number(String(s).replace(",", "."));
  return n;
}

function formatCoverage(start?: string | null, end?: string | null): string {
  if (!start && !end) return "-";
  const fmt = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
    return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  };
  if (start && end) return `${fmt(start)} a ${fmt(end)}`;
  return start ? `desde ${fmt(start)}` : `até ${fmt(end!)}`;
}

export function MeasurementItemsList(props: Props): JSX.Element | null {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const canEdit = props.measurementStatus !== "APPROVED";
  const canRemove = props.measurementStatus === "OPEN";

  async function remove(itemId: string): Promise<void> {
    if (!canRemove) return;
    if (!window.confirm("Remover esta linha da medição?")) {
      return;
    }
    setBusyId(itemId);
    setMsg(null);
    try {
      const updated = await deleteMeasurementItem(props.measurementId, itemId);
      if (props.onMeasurementUpdate) {
        props.onMeasurementUpdate(updated);
      } else {
        router.refresh();
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao remover");
    } finally {
      setBusyId(null);
    }
  }

  async function saveQuantity(itemId: string, event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canEdit) return;
    const fd = new FormData(event.currentTarget);
    const q = parseQty(String(fd.get("quantity") ?? ""));
    if (!Number.isFinite(q) || q < 0) {
      setMsg("Indique uma quantidade válida (zero ou maior).");
      return;
    }
    setBusyId(itemId);
    setMsg(null);
    setSyncMsg(null);
    try {
      const updated = await patchMeasurementItemQuantity(props.measurementId, itemId, q);
      if (props.onMeasurementUpdate) {
        props.onMeasurementUpdate(updated);
        setSyncMsg("Quantidade salva. Utilize «Calcular medição» para atualizar o valor medido no resumo.");
      } else {
        router.refresh();
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao atualizar");
    } finally {
      setBusyId(null);
    }
  }

  if (props.items.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 font-medium">Período</th>
              <th className="px-3 py-2 font-medium">Modalidade</th>
              <th className="px-3 py-2 font-medium">Qtd / %</th>
              <th className="px-3 py-2 font-medium text-right">Bruto</th>
              <th className="px-3 py-2 font-medium text-right">Glosas</th>
              <th className="px-3 py-2 font-medium text-right">Líquido</th>
              <th className="px-3 py-2 font-medium">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {props.items.map((item) => {
              const gross = Number(item.calculatedValue) || 0;
              const glosed = Number(item.glosedValue ?? 0) || 0;
              const net = Math.max(0, gross - glosed);
              const title =
                item.descriptionSnapshot ||
                item.pricingItem?.description ||
                (item.isLegacyMonthly ? "Mensalidade legada" : item.type);
              const modality = item.billingKindSnapshot
                ? billingLabel[item.billingKindSnapshot] ?? item.billingKindSnapshot
                : "-";
              const needsQty =
                item.billingKindSnapshot === "ON_DEMAND" || item.billingKindSnapshot === "ONE_TIME";

              return (
                <tr key={item.id} className="text-slate-700">
                  <td className="px-3 py-3 align-top">
                    <div className="font-medium text-slate-900">{title}</div>
                    {item.isLegacyMonthly ? (
                      <div className="text-xs text-amber-700">Linha legada</div>
                    ) : null}
                    {item.unitValueSnapshot ? (
                      <div className="text-xs text-slate-500">
                        Unitário: {formatBrl(item.unitValueSnapshot)}
                      </div>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 align-top text-xs">
                    {formatCoverage(item.coverageStart, item.coverageEnd)}
                  </td>
                  <td className="px-3 py-3 align-top text-xs">{modality}</td>
                  <td className="px-3 py-3 align-top">
                    {canEdit && needsQty ? (
                      <form className="flex flex-wrap items-center gap-1" onSubmit={(e) => void saveQuantity(item.id, e)}>
                        <label className="sr-only" htmlFor={`qty-${item.id}`}>
                          Quantidade
                        </label>
                        <input
                          id={`qty-${item.id}`}
                          name="quantity"
                          type="number"
                          min="0"
                          step="any"
                          required
                          defaultValue={parseQty(item.quantity) || 0}
                          disabled={busyId === item.id}
                          className="w-24 rounded-md border border-slate-200 px-2 py-1 text-sm tabular-nums"
                        />
                        <button
                          type="submit"
                          disabled={busyId === item.id}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {busyId === item.id ? "…" : "Salvar"}
                        </button>
                      </form>
                    ) : (
                      <span className="tabular-nums">{item.quantity}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 align-top text-right tabular-nums">{formatBrl(item.calculatedValue)}</td>
                  <td className="px-3 py-3 align-top text-right tabular-nums">{formatBrl(glosed)}</td>
                  <td className="px-3 py-3 align-top text-right tabular-nums font-medium text-slate-900">
                    {formatBrl(net)}
                  </td>
                  <td className="px-3 py-3 align-top">
                    {canRemove ? (
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        className="text-xs font-medium text-red-700 underline decoration-red-200 hover:decoration-red-700 disabled:opacity-50"
                        onClick={() => void remove(item.id)}
                      >
                        Remover
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {syncMsg ? <p className="text-sm text-slate-600">{syncMsg}</p> : null}
      {msg ? <p className="text-sm text-red-600">{msg}</p> : null}
    </div>
  );
}
