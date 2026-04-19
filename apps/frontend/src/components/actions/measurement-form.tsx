"use client";

import { FormEvent, useMemo, useState } from "react";
import { createMeasurement } from "@/lib/api";
import { FormField, FormSection, PrimaryButton, formControlClass } from "@/components/ui/form-primitives";

type ContractOption = { id: string; number: string; name: string };

type Props = {
  onSuccess?: () => void;
  contractOptions?: ContractOption[];
  defaultContractId?: string;
};

export function MeasurementForm({ onSuccess, contractOptions, defaultContractId }: Props): JSX.Element {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const now = new Date();
  const defaultMonth = now.getMonth() + 1;
  const defaultYear = now.getFullYear();

  const hasSelect = Boolean(contractOptions && contractOptions.length > 0);
  const initialContract =
    defaultContractId && contractOptions?.some((c) => c.id === defaultContractId) ? defaultContractId : "";

  const [contractId, setContractId] = useState(initialContract);
  const [referenceMonth, setReferenceMonth] = useState(String(defaultMonth));
  const [referenceYear, setReferenceYear] = useState(String(defaultYear));

  const monthNum = Number(referenceMonth);
  const yearNum = Number(referenceYear);

  const contractLabel = useMemo(() => {
    if (!hasSelect || !contractId) return "";
    const c = contractOptions!.find((x) => x.id === contractId);
    return c ? `${c.number} — ${c.name}` : "";
  }, [contractId, contractOptions, hasSelect]);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setStatus("");
    const err: Record<string, string> = {};
    const cid = hasSelect ? contractId : String((event.currentTarget.elements.namedItem("contractId") as HTMLInputElement)?.value ?? "");
    if (!cid.trim()) err.contractId = "Indique o contrato.";
    if (!Number.isFinite(monthNum) || monthNum < 1 || monthNum > 12) err.referenceMonth = "Mês entre 1 e 12.";
    if (!Number.isFinite(yearNum) || yearNum < 2000 || yearNum > 2100) err.referenceYear = "Ano inválido.";
    setFieldErrors(err);
    if (Object.keys(err).length > 0) return;

    try {
      setBusy(true);
      await createMeasurement({
        contractId: cid.trim(),
        referenceMonth: monthNum,
        referenceYear: yearNum
      });
      setStatus("Medição criada com sucesso.");
      setFieldErrors({});
      if (!hasSelect) {
        event.currentTarget.reset();
      } else {
        setContractId(initialContract);
      }
      setReferenceMonth(String(defaultMonth));
      setReferenceYear(String(defaultYear));
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
        title="Competência e contrato"
        description="A medição é única por contrato, mês e ano. Use a competência corrente quando fizer sentido operacional."
      >
        {hasSelect ? (
          <FormField label="Contrato" htmlFor="m-contract" required error={fieldErrors.contractId} className="sm:col-span-2">
            <select
              id="m-contract"
              name="contractId"
              className={formControlClass}
              value={contractId}
              onChange={(e) => {
                setContractId(e.target.value);
                setFieldErrors((p) => {
                  const n = { ...p };
                  delete n.contractId;
                  return n;
                });
              }}
            >
              <option value="" disabled>
                Selecione…
              </option>
              {contractOptions!.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.number} — {c.name}
                </option>
              ))}
            </select>
            {contractLabel ? <p className="mt-1 text-xs text-slate-500">Selecionado: {contractLabel}</p> : null}
          </FormField>
        ) : (
          <FormField label="ID do contrato" htmlFor="m-contract-uuid" required error={fieldErrors.contractId} className="sm:col-span-2">
            <input
              id="m-contract-uuid"
              name="contractId"
              defaultValue={defaultContractId ?? ""}
              className={formControlClass}
              placeholder="UUID do contrato"
              autoComplete="off"
            />
          </FormField>
        )}
        <FormField label="Mês (1–12)" htmlFor="m-month" required error={fieldErrors.referenceMonth}>
          <input
            id="m-month"
            name="referenceMonth"
            type="number"
            min={1}
            max={12}
            className={formControlClass}
            value={referenceMonth}
            onChange={(e) => setReferenceMonth(e.target.value)}
          />
        </FormField>
        <FormField label="Ano" htmlFor="m-year" required error={fieldErrors.referenceYear}>
          <input
            id="m-year"
            name="referenceYear"
            type="number"
            min={2000}
            max={2100}
            className={formControlClass}
            value={referenceYear}
            onChange={(e) => setReferenceYear(e.target.value)}
          />
        </FormField>
      </FormSection>

      {status ? (
        <p className={`text-sm ${status.includes("sucesso") ? "text-emerald-700" : "text-amber-800"}`} role="status">
          {status}
        </p>
      ) : null}

      <PrimaryButton type="submit" busy={busy} busyLabel="A guardar…">
        Cadastrar medição
      </PrimaryButton>
    </form>
  );
}
