"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteMeasurementItem } from "@/lib/api";
import { formatBrl } from "@/lib/format-brl";

type ItemRow = { id: string; type: string; referenceId: string; quantity: string; calculatedValue: string };

type Props = {
  measurementId: string;
  measurementStatus: string;
  items: ItemRow[];
};

export function MeasurementItemsList(props: Props): JSX.Element | null {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const canRemove = props.measurementStatus === "OPEN";

  async function remove(itemId: string): Promise<void> {
    if (!canRemove) return;
    if (!window.confirm("Remover esta linha da medição?")) {
      return;
    }
    setBusyId(itemId);
    setMsg(null);
    try {
      await deleteMeasurementItem(props.measurementId, itemId);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao remover");
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
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm text-slate-700">
            <span>
              {item.type} · ref. <span className="font-mono text-xs">{item.referenceId}</span> · qtd. {item.quantity} ·{" "}
              {formatBrl(item.calculatedValue)}
            </span>
            {canRemove ? (
              <button
                type="button"
                disabled={busyId === item.id}
                className="text-xs font-medium text-red-700 underline decoration-red-200 hover:decoration-red-700 disabled:opacity-50"
                onClick={() => void remove(item.id)}
              >
                {busyId === item.id ? "A remover…" : "Remover"}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {msg ? <p className="text-sm text-red-600">{msg}</p> : null}
    </div>
  );
}
