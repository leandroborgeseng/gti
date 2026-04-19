"use client";

import { FormEvent, useState } from "react";
import { createGlosa } from "@/lib/api";
import { FormField, FormSection, PrimaryButton, formControlClass } from "@/components/ui/form-primitives";

export type MeasurementOption = { id: string; label: string };

type Props = {
  onSuccess?: () => void;
  /** Lista de medições (evita colar UUID). */
  measurementOptions?: MeasurementOption[];
};

export function GlosaForm({ onSuccess, measurementOptions }: Props): JSX.Element {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [measurementId, setMeasurementId] = useState("");
  const [type, setType] = useState<"ATRASO" | "NAO_ENTREGA" | "SLA" | "QUALIDADE">("ATRASO");
  const [value, setValue] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [justification, setJustification] = useState("");

  const hasSelect = Boolean(measurementOptions && measurementOptions.length > 0);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setStatus("");
    const err: Record<string, string> = {};
    const mid = hasSelect ? measurementId : String((event.currentTarget.elements.namedItem("measurementId") as HTMLInputElement)?.value ?? "").trim();
    if (!mid) err.measurementId = "Associe a uma medição.";
    const v = Number(String(value).replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) err.value = "Informe um valor maior que zero.";
    if (!justification.trim()) err.justification = "A justificativa é obrigatória.";
    setFieldErrors(err);
    if (Object.keys(err).length > 0) return;

    try {
      setBusy(true);
      await createGlosa({
        measurementId: mid,
        type,
        value: v,
        createdBy: createdBy.trim() || undefined,
        justification: justification.trim()
      });
      setStatus("Glosa cadastrada com sucesso.");
      if (hasSelect) {
        setMeasurementId("");
        setValue("");
        setCreatedBy("");
        setJustification("");
      } else {
        event.currentTarget.reset();
      }
      onSuccess?.();
    } catch (error) {
      setStatus(String(error instanceof Error ? error.message : error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={(event) => void onSubmit(event)}>
      <FormSection
        title="Ligação e tipo"
        description="A glosa associa-se a uma medição já existente. O tipo categoriza o motivo."
      >
        {hasSelect ? (
          <FormField label="Medição" htmlFor="g-measurement" required error={fieldErrors.measurementId} className="sm:col-span-2">
            <select
              id="g-measurement"
              name="measurementId"
              className={formControlClass}
              value={measurementId}
              onChange={(e) => {
                setMeasurementId(e.target.value);
                setFieldErrors((p) => {
                  const n = { ...p };
                  delete n.measurementId;
                  return n;
                });
              }}
            >
              <option value="" disabled>
                Selecione…
              </option>
              {measurementOptions!.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </FormField>
        ) : (
          <FormField label="ID da medição" htmlFor="g-measurement-id" required error={fieldErrors.measurementId} className="sm:col-span-2">
            <input
              id="g-measurement-id"
              name="measurementId"
              className={formControlClass}
              placeholder="UUID da medição"
              autoComplete="off"
            />
          </FormField>
        )}
        <FormField label="Tipo" htmlFor="g-type" required>
          <select id="g-type" name="type" className={formControlClass} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="ATRASO">Atraso</option>
            <option value="NAO_ENTREGA">Não entrega</option>
            <option value="SLA">SLA</option>
            <option value="QUALIDADE">Qualidade</option>
          </select>
        </FormField>
      </FormSection>

      <FormSection title="Valor e justificativa" description="O valor deve ser coerente com a medição. Quem regista pode ser indicado abaixo.">
        <FormField label="Valor (R$)" htmlFor="g-value" required error={fieldErrors.value}>
          <input
            id="g-value"
            name="value"
            type="text"
            inputMode="decimal"
            className={formControlClass}
            placeholder="0,00"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </FormField>
        <FormField label="Responsável pelo registo (opcional)" htmlFor="g-by">
          <input
            id="g-by"
            name="createdBy"
            className={formControlClass}
            placeholder="Identificador ou nome"
            value={createdBy}
            onChange={(e) => setCreatedBy(e.target.value)}
          />
        </FormField>
        <FormField label="Justificativa" htmlFor="g-just" required error={fieldErrors.justification} className="sm:col-span-2">
          <textarea
            id="g-just"
            name="justification"
            className={`${formControlClass} min-h-[88px] resize-y`}
            rows={3}
            placeholder="Fundamento da glosa"
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
          />
        </FormField>
      </FormSection>

      {status ? (
        <p className={`text-sm ${status.includes("sucesso") ? "text-emerald-700" : "text-amber-800"}`} role="status">
          {status}
        </p>
      ) : null}

      <PrimaryButton type="submit" busy={busy} busyLabel="A guardar…">
        Guardar glosa
      </PrimaryButton>
    </form>
  );
}
