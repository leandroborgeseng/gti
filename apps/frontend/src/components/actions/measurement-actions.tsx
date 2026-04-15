"use client";

import { useState } from "react";
import { approveMeasurement, calculateMeasurement } from "@/lib/api";

type Props = {
  measurementId: string;
};

export function MeasurementActions({ measurementId }: Props): JSX.Element {
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState<"calculate" | "approve" | null>(null);

  async function onCalculate(): Promise<void> {
    try {
      setBusy("calculate");
      await calculateMeasurement(measurementId);
      setStatus("Medição calculada com sucesso.");
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
          disabled={busy != null}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === "calculate" ? "Calculando..." : "Calcular"}
        </button>
        <button
          type="button"
          onClick={() => void onApprove()}
          disabled={busy != null}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === "approve" ? "Aprovando..." : "Aprovar"}
        </button>
      </div>
      {status ? <p className="text-sm text-slate-600">{status}</p> : null}
    </div>
  );
}
