"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { approveMeasurement, calculateMeasurement } from "@/lib/api";

type Props = {
  measurementId: string;
  measurementStatus?: string;
};

export function MeasurementActions({ measurementId, measurementStatus }: Props): JSX.Element {
  const router = useRouter();
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState<"calculate" | "approve" | null>(null);
  const canCalculate = measurementStatus !== "APPROVED";
  const canApprove = measurementStatus !== "OPEN" && measurementStatus !== "APPROVED";

  async function onCalculate(): Promise<void> {
    try {
      setBusy("calculate");
      await calculateMeasurement(measurementId);
      setStatus("Medição calculada com sucesso.");
      router.refresh();
    } catch (error) {
      setStatus(String(error instanceof Error ? error.message : error));
    } finally {
      setBusy(null);
    }
  }

  async function onApprove(): Promise<void> {
    try {
      setBusy("approve");
      await approveMeasurement(measurementId);
      setStatus("Medição aprovada com sucesso.");
      router.refresh();
    } catch (error) {
      setStatus(String(error instanceof Error ? error.message : error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void onCalculate()}
          disabled={busy != null || !canCalculate}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === "calculate" ? "Calculando..." : "Calcular"}
        </button>
        <button
          type="button"
          onClick={() => void onApprove()}
          disabled={busy != null || !canApprove}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === "approve" ? "Aprovando..." : "Aprovar"}
        </button>
      </div>
      {!canCalculate ? <p className="text-xs text-amber-700">Medição aprovada não permite recálculo.</p> : null}
      {!canApprove ? <p className="text-xs text-amber-700">Para aprovar, calcule a medição primeiro.</p> : null}
      {status ? <p className="text-sm text-slate-600">{status}</p> : null}
    </div>
  );
}
