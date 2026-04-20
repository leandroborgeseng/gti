"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { approveMeasurement, calculateMeasurement } from "@/lib/api";
import { Button } from "@/components/ui/button";

type Props = {
  measurementId: string;
  measurementStatus?: string;
};

export function MeasurementActions({ measurementId, measurementStatus }: Props): JSX.Element {
  const router = useRouter();
  const canCalculate = measurementStatus !== "APPROVED";
  const canApprove = measurementStatus !== "OPEN" && measurementStatus !== "APPROVED";

  const calculateMut = useMutation({
    mutationFn: () => calculateMeasurement(measurementId),
    onSuccess: () => {
      toast.success("Medição calculada.");
      router.refresh();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Erro ao calcular a medição.");
    }
  });

  const approveMut = useMutation({
    mutationFn: () => approveMeasurement(measurementId),
    onSuccess: () => {
      toast.success("Medição aprovada.");
      router.refresh();
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
          {calculateMut.isPending ? "A calcular…" : "Calcular"}
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
