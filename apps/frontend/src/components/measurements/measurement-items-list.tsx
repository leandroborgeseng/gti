"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Measurement } from "@/lib/api";
import { deleteMeasurementItem, patchMeasurementItemQuantity } from "@/lib/api";
import { formatBrl } from "@/lib/format-brl";

type ItemRow = { id: string; type: string; referenceId: string; quantity: string; calculatedValue: string };

type Props = {
  measurementId: string;
  measurementStatus: string;
  items: ItemRow[];
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

export function MeasurementItemsList(props: Props): JSX.Element | null {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const canEdit = props.measurementStatus === "OPEN";

  async function remove(itemId: string): Promise<void> {
    if (!canEdit) return;
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
    if (!Number.isFinite(q) || q <= 0) {
      setMsg("Indique uma quantidade maior que zero.");
      return;
    }
    setBusyId(itemId);
    setMsg(null);
    setSyncMsg(null);
    try {
      const updated = await patchMeasurementItemQuantity(props.measurementId, itemId, q);
      if (props.onMeasurementUpdate) {
        props.onMeasurementUpdate(updated);
        setSyncMsg("Quantidade guardada. Utilize Calcular para atualizar o valor medido no resumo.");
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
      <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
        {props.items.map((item) => (
          <li key={item.id} className="flex flex-col gap-2 px-3 py-3 text-sm text-slate-700 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div>
              <span className="font-medium text-slate-900">{item.type}</span> · ref.{" "}
              <span className="font-mono text-xs">{item.referenceId}</span>
              <div className="mt-0.5 text-xs text-slate-500">
                Valor calculado (último cálculo): <span className="tabular-nums">{formatBrl(item.calculatedValue)}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canEdit ? (
                <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => void saveQuantity(item.id, e)}>
                  <label className="sr-only" htmlFor={`qty-${item.id}`}>
                    Quantidade
                  </label>
                  <input
                    id={`qty-${item.id}`}
                    name="quantity"
                    type="number"
                    min="0.0001"
                    step="any"
                    required
                    defaultValue={parseQty(item.quantity) || ""}
                    disabled={busyId === item.id}
                    className="w-28 rounded-md border border-slate-200 px-2 py-1 text-sm tabular-nums"
                  />
                  <button
                    type="submit"
                    disabled={busyId === item.id}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {busyId === item.id ? "A guardar…" : "Guardar quantidade"}
                  </button>
                </form>
              ) : (
                <span className="tabular-nums text-slate-600">Qtd. {item.quantity}</span>
              )}
              {canEdit ? (
                <button
                  type="button"
                  disabled={busyId === item.id}
                  className="text-xs font-medium text-red-700 underline decoration-red-200 hover:decoration-red-700 disabled:opacity-50"
                  onClick={() => void remove(item.id)}
                >
                  Remover
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {syncMsg ? <p className="text-sm text-slate-600">{syncMsg}</p> : null}
      {msg ? <p className="text-sm text-red-600">{msg}</p> : null}
    </div>
  );
}
