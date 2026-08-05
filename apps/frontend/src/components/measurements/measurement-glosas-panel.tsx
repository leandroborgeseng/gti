"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { MeasurementGlosaRow } from "@/lib/api";
import { addMeasurementGlosa } from "@/lib/api";
import { formatBrl } from "@/lib/format-brl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const typeLabel: Record<string, string> = {
  ATRASO: "Atraso",
  NAO_ENTREGA: "Não entrega",
  SLA: "SLA",
  QUALIDADE: "Qualidade"
};

const originLabel: Record<string, string> = {
  AUTOMATIC: "Automática",
  MANUAL: "Manual"
};

type Props = {
  measurementId: string;
  measurementStatus: string;
  glosas: MeasurementGlosaRow[];
  itemOptions?: Array<{ id: string; label: string }>;
};

export function MeasurementGlosasPanel(props: Props): JSX.Element {
  const router = useRouter();
  const frozen = props.measurementStatus === "APPROVED";
  const canAdd = !frozen && props.measurementStatus !== "OPEN";
  const [type, setType] = useState("QUALIDADE");
  const [value, setValue] = useState("");
  const [justification, setJustification] = useState("");
  const [measurementItemId, setMeasurementItemId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const automatic = props.glosas.filter((g) => g.origin === "AUTOMATIC");
  const manual = props.glosas.filter((g) => g.origin !== "AUTOMATIC");

  async function submit(): Promise<void> {
    if (!canAdd) return;
    const n = Number(String(value).replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Informe um valor de glosa maior que zero.");
      return;
    }
    if (!justification.trim()) {
      toast.error("Glosa manual exige justificativa.");
      return;
    }
    setBusy(true);
    try {
      await addMeasurementGlosa(props.measurementId, {
        type,
        value: n,
        justification: justification.trim(),
        ...(measurementItemId ? { measurementItemId } : {})
      });
      toast.success("Glosa manual registrada.");
      setValue("");
      setJustification("");
      setMeasurementItemId("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao registrar glosa.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h5 className="text-sm font-medium text-slate-800">Automáticas</h5>
        {automatic.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma glosa automática nesta competência.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
            {automatic.map((g) => (
              <li key={g.id} className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <span className="font-medium text-slate-900">{typeLabel[g.type] ?? g.type}</span>
                  <span className="ml-2 text-xs text-slate-500">{originLabel.AUTOMATIC}</span>
                  <p className="mt-0.5 text-xs text-slate-600">{g.justification}</p>
                  <p className="text-xs text-slate-400">Valor não editável</p>
                </div>
                <span className="tabular-nums text-slate-800">{formatBrl(g.value)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <h5 className="text-sm font-medium text-slate-800">Manuais</h5>
        {manual.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma glosa manual registrada.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
            {manual.map((g) => (
              <li key={g.id} className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <span className="font-medium text-slate-900">{typeLabel[g.type] ?? g.type}</span>
                  <span className="ml-2 text-xs text-slate-500">{originLabel.MANUAL}</span>
                  <p className="mt-0.5 text-xs text-slate-600">{g.justification}</p>
                  <p className="text-xs text-slate-400">
                    {g.createdBy} · {new Date(g.createdAt).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <span className="tabular-nums text-slate-800">{formatBrl(g.value)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canAdd ? (
        <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-medium text-slate-800">Adicionar glosa manual</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-slate-600">Tipo</label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(typeLabel).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">Valor (R$)</label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0,00"
              />
            </div>
            {(props.itemOptions?.length ?? 0) > 0 ? (
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-slate-600">Linha da medição (opcional)</label>
                <Select
                  value={measurementItemId || "__none__"}
                  onValueChange={(v) => setMeasurementItemId(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Medição inteira" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Medição inteira</SelectItem>
                    {props.itemOptions!.map((opt) => (
                      <SelectItem key={opt.id} value={opt.id}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-slate-600">Justificativa (obrigatória)</label>
              <textarea
                className="min-h-[72px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Descreva o motivo da glosa…"
              />
            </div>
          </div>
          <Button type="button" disabled={busy} onClick={() => void submit()}>
            {busy ? "Salvando…" : "Registrar glosa"}
          </Button>
        </div>
      ) : frozen ? (
        <p className="text-xs text-amber-700">Medição aprovada: glosas congeladas.</p>
      ) : (
        <p className="text-xs text-slate-500">Calcule a medição antes de registrar glosas manuais.</p>
      )}
    </div>
  );
}
