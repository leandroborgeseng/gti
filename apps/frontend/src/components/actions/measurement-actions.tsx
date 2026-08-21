"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { approveMeasurement, calculateMeasurement, type Measurement } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";

type Props = {
  measurementId: string;
  measurementStatus?: string;
  onUpdated?: (measurement: Measurement) => void;
};

export function MeasurementActions({ measurementId, measurementStatus, onUpdated }: Props): JSX.Element {
  const qc = useQueryClient();
  const canCalculate = measurementStatus !== "APPROVED";
  const canApprove = measurementStatus !== "OPEN" && measurementStatus !== "APPROVED";

  function apply(next: Measurement): void {
    qc.setQueryData(queryKeys.measurement(measurementId), next);
    void qc.invalidateQueries({ queryKey: queryKeys.measurements });
    onUpdated?.(next);
  }

  const calculateMut = useMutation({
    mutationFn: () => calculateMeasurement(measurementId),
    onSuccess: (data) => {
      toast.success("Medição calculada.");
      apply(data);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Erro ao calcular a medição.");
    }
  });

  const approveMut = useMutation({
    mutationFn: () => approveMeasurement(measurementId),
    onSuccess: (data) => {
      toast.success("Medição aprovada.");
      apply(data);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Erro ao aprovar a medição.");
    }
  });

  const busy = calculateMut.isPending || approveMut.isPending;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy || !canCalculate} onClick={() => calculateMut.mutate()}>
          {calculateMut.isPending ? "A calcular…" : "Calcular medição"}
        </Button>
        <Button type="button" variant="secondary" disabled={busy || !canApprove} onClick={() => approveMut.mutate()}>
          {approveMut.isPending ? "A aprovar…" : "Aprovar"}
        </Button>
      </div>
      {!canCalculate ? (
        <p className="text-xs text-amber-700 dark:text-amber-500">Medição aprovada não permite recálculo.</p>
      ) : null}
      {measurementStatus === "OPEN" ? (
        <p className="text-xs text-amber-700 dark:text-amber-500">Para aprovar, calcule a medição primeiro.</p>
      ) : null}
    </div>
  );
}
