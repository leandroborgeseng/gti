"use client";

import { FormEvent, useState } from "react";
import { createFiscal } from "@/lib/api";
import { FormField, FormSection, PrimaryButton, formControlClass } from "@/components/ui/form-primitives";

type Props = {
  onSuccess?: () => void;
};

export function FiscalForm({ onSuccess }: Props): JSX.Element {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      setBusy(true);
      await createFiscal({
        name: String(data.get("name") ?? ""),
        email: String(data.get("email") ?? ""),
        phone: String(data.get("phone") ?? "")
      });
      setStatus("Fiscal cadastrado com sucesso.");
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
      <FormSection title="Dados do fiscal" description="Nome, e-mail e telefone de contacto.">
        <FormField label="Nome" htmlFor="fiscal-name" required>
          <input id="fiscal-name" required name="name" className={formControlClass} placeholder="Nome completo" />
        </FormField>
        <FormField label="E-mail" htmlFor="fiscal-email" required>
          <input id="fiscal-email" required type="email" name="email" className={formControlClass} placeholder="email@org.br" />
        </FormField>
        <FormField label="Telefone" htmlFor="fiscal-phone" required className="sm:col-span-2">
          <input id="fiscal-phone" required name="phone" className={formControlClass} placeholder="Telefone" />
        </FormField>
      </FormSection>
      <div className="flex flex-wrap items-center gap-3">
        <PrimaryButton type="submit" busy={busy} busyLabel="A guardar…">
          Cadastrar fiscal
        </PrimaryButton>
        {status ? <span className="text-sm text-slate-600">{status}</span> : null}
      </div>
    </form>
  );
}
