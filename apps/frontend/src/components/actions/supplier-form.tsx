"use client";

import { FormEvent, useState } from "react";
import { createSupplier } from "@/lib/api";
import { FormField, FormSection, PrimaryButton, formControlClass } from "@/components/ui/form-primitives";

type Props = {
  onSuccess?: () => void;
};

export function SupplierForm({ onSuccess }: Props): JSX.Element {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      setBusy(true);
      await createSupplier({
        name: String(data.get("name") ?? ""),
        cnpj: String(data.get("cnpj") ?? "").replace(/\D/g, "")
      });
      setStatus("Fornecedor cadastrado com sucesso.");
      event.currentTarget.reset();
      onSuccess?.();
    } catch (error) {
      setStatus(String(error instanceof Error ? error.message : error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={(event) => void onSubmit(event)}>
      <FormSection title="Dados do fornecedor" description="Razão social e CNPJ (apenas dígitos ao enviar).">
        <FormField label="Razão social" htmlFor="sup-name" required className="sm:col-span-2">
          <input id="sup-name" required name="name" className={formControlClass} placeholder="Nome do fornecedor" />
        </FormField>
        <FormField label="CNPJ" htmlFor="sup-cnpj" required>
          <input id="sup-cnpj" required name="cnpj" className={formControlClass} placeholder="Somente números ou com máscara" inputMode="numeric" />
        </FormField>
      </FormSection>
      <div className="flex flex-wrap items-center gap-3">
        <PrimaryButton type="submit" busy={busy} busyLabel="A guardar…">
          Cadastrar fornecedor
        </PrimaryButton>
        {status ? <span className="text-sm text-slate-600">{status}</span> : null}
      </div>
    </form>
  );
}
