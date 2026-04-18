"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { addMeasurementServiceLines } from "@/lib/api";

type ServiceRow = { id: string; name: string; unit: string; unitValue: string };

type Props = {
  measurementId: string;
  services: ServiceRow[];
  usedServiceIds: string[];
};

export function MeasurementAddServiceLines(props: Props): JSX.Element {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const available = props.services.filter((s) => !props.usedServiceIds.includes(s.id));

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const referenceId = String(data.get("serviceId") ?? "");
    const quantity = Number(data.get("quantity") ?? 0);
    if (!referenceId) {
      setStatus("Selecione um serviço.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setStatus("Indique uma quantidade maior que zero.");
      return;
    }
    try {
      setBusy(true);
      setStatus("");
      await addMeasurementServiceLines(props.measurementId, [{ type: "SERVICE", referenceId, quantity }]);
      setStatus("Linha adicionada.");
      event.currentTarget.reset();
      router.refresh();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Falha ao adicionar");
    } finally {
      setBusy(false);
    }
  }

  if (props.services.length === 0) {
    return (
      <p className="text-sm text-amber-800">
        Este contrato não tem serviços cadastrados. Defina serviços na ficha do contrato antes de lançar consumos.
      </p>
    );
  }

  if (available.length === 0) {
    return <p className="text-sm text-slate-600">Todos os serviços do contrato já têm linha nesta medição.</p>;
  }

  return (
    <form className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end" onSubmit={(event) => void onSubmit(event)}>
      <label className="grid gap-1 text-sm sm:min-w-[14rem]">
        <span className="font-medium text-slate-700">Serviço</span>
        <select required name="serviceId" className="rounded-md border border-slate-200 px-3 py-2 text-sm">
          <option value="">Selecione…</option>
          {available.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.unit})
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm sm:w-36">
        <span className="font-medium text-slate-700">Quantidade</span>
        <input required name="quantity" type="number" min="0.0001" step="any" className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {busy ? "A guardar…" : "Adicionar linha"}
      </button>
      {status ? <p className="w-full text-sm text-slate-600">{status}</p> : null}
    </form>
  );
}
