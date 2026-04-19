"use client";

import { FormEvent, useState } from "react";
import type { UserRecord } from "@/lib/api";
import { createUser } from "@/lib/api";
import { FormField, FormSection, PrimaryButton, formControlClass } from "@/components/ui/form-primitives";

type Props = {
  onSuccess?: () => void;
  /** Chamado com o registo criado (ex.: selecionar automaticamente noutro formulário). */
  onCreated?: (user: UserRecord) => void;
  /** Texto do botão de envio (padrão: criar utilizador). */
  submitLabel?: string;
};

export function UserForm({ onSuccess, onCreated, submitLabel = "Criar utilizador" }: Props): JSX.Element {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      setBusy(true);
      const created = await createUser({
        email: String(data.get("email") ?? "").trim().toLowerCase(),
        password: String(data.get("password") ?? ""),
        role: (String(data.get("role") ?? "EDITOR") || "EDITOR") as "ADMIN" | "EDITOR" | "VIEWER"
      });
      setStatus("Utilizador criado com sucesso.");
      event.currentTarget.reset();
      onCreated?.(created);
      onSuccess?.();
    } catch (error) {
      setStatus(String(error instanceof Error ? error.message : error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={(event) => void onSubmit(event)}>
      <FormSection title="Credenciais e papel" description="E-mail único no sistema. Palavra-passe com pelo menos 8 caracteres.">
        <FormField label="E-mail" htmlFor="user-email" required className="sm:col-span-2">
          <input
            id="user-email"
            required
            type="email"
            name="email"
            className={formControlClass}
            placeholder="nome@instituicao.gov.br"
            autoComplete="off"
          />
        </FormField>
        <FormField label="Palavra-passe inicial" htmlFor="user-password" required className="sm:col-span-2">
          <input id="user-password" required type="password" name="password" minLength={8} className={formControlClass} autoComplete="new-password" />
        </FormField>
        <FormField label="Papel" htmlFor="user-role" required className="sm:col-span-2">
          <select id="user-role" name="role" className={formControlClass} defaultValue="EDITOR">
            <option value="VIEWER">Leitura (VIEWER)</option>
            <option value="EDITOR">Edição (EDITOR)</option>
            <option value="ADMIN">Administrador (ADMIN)</option>
          </select>
        </FormField>
      </FormSection>

      {status ? <p className="text-sm text-slate-600">{status}</p> : null}

      <PrimaryButton type="submit" busy={busy} busyLabel="A guardar…">
        {submitLabel}
      </PrimaryButton>
    </form>
  );
}
