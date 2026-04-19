"use client";

import { FormEvent, useState } from "react";
import { createGovernanceTicket } from "@/lib/api";
import { FormField, FormSection, PrimaryButton, formControlClass } from "@/components/ui/form-primitives";

type ContractOption = { id: string; number: string; name: string };

type Props = {
  onSuccess?: () => void;
  /** Contratos para evitar colar UUID do contrato. */
  contractOptions?: ContractOption[];
};

export function GovernanceCreateForm({ onSuccess, contractOptions }: Props): JSX.Element {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [ticketId, setTicketId] = useState("");
  const [contractId, setContractId] = useState("");
  const [openedAt, setOpenedAt] = useState("");

  const hasContracts = Boolean(contractOptions && contractOptions.length > 0);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setStatus("");
    const err: Record<string, string> = {};
    if (!ticketId.trim()) err.ticketId = "Indique o identificador do chamado no GLPI.";
    const cid = hasContracts ? contractId : String((event.currentTarget.elements.namedItem("contractId") as HTMLInputElement)?.value ?? "").trim();
    if (!cid) err.contractId = "Selecione ou indique o contrato.";
    setFieldErrors(err);
    if (Object.keys(err).length > 0) return;

    try {
      setBusy(true);
      await createGovernanceTicket({
        ticketId: ticketId.trim(),
        contractId: cid,
        openedAt: openedAt.trim() || undefined
      });
      setStatus("Chamado de governança criado com sucesso.");
      setTicketId("");
      if (hasContracts) setContractId("");
      else (event.currentTarget.elements.namedItem("contractId") as HTMLInputElement).value = "";
      setOpenedAt("");
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
        title="Identificadores"
        description="O ID do chamado é o identificador no GLPI. O contrato deve existir na gestão contratual."
      >
        <FormField label="ID do chamado (GLPI)" htmlFor="gov-ticket" required error={fieldErrors.ticketId} className="sm:col-span-2">
          <input
            id="gov-ticket"
            className={formControlClass}
            value={ticketId}
            onChange={(e) => setTicketId(e.target.value)}
            placeholder="Ex.: número do ticket na API GLPI"
            autoComplete="off"
          />
        </FormField>
        {hasContracts ? (
          <FormField label="Contrato" htmlFor="gov-contract" required error={fieldErrors.contractId} className="sm:col-span-2">
            <select
              id="gov-contract"
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
          </FormField>
        ) : (
          <FormField label="ID do contrato" htmlFor="gov-contract-uuid" required error={fieldErrors.contractId} className="sm:col-span-2">
            <input id="gov-contract-uuid" name="contractId" className={formControlClass} placeholder="UUID do contrato" autoComplete="off" />
          </FormField>
        )}
      </FormSection>

      <FormSection title="Data de abertura (opcional)" description="Se vazio, o servidor usa a data e hora atuais.">
        <FormField label="Aberto em" htmlFor="gov-opened" className="sm:col-span-2">
          <input id="gov-opened" type="datetime-local" name="openedAt" className={formControlClass} value={openedAt} onChange={(e) => setOpenedAt(e.target.value)} />
        </FormField>
      </FormSection>

      {status ? (
        <p className={`text-sm ${status.includes("sucesso") ? "text-emerald-700" : "text-amber-800"}`} role="status">
          {status}
        </p>
      ) : null}

      <PrimaryButton type="submit" busy={busy} busyLabel="A guardar…">
        Cadastrar chamado de governança
      </PrimaryButton>
    </form>
  );
}
