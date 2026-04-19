"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { UserRecord } from "@/lib/api";
import { createGoal } from "@/lib/api";
import { Modal } from "@/components/ui/modal";
import { UserForm } from "@/components/actions/user-form";
import { EntitySelectWithCreate } from "@/components/ui/entity-select-with-create";
import { FormField, FormSection, PrimaryButton, formControlClass } from "@/components/ui/form-primitives";

type Props = {
  onSuccess?: () => void;
  /** Utilizadores para o campo «Responsável» (evita UUID manual). */
  users?: UserRecord[];
};

export function GoalCreateForm({ onSuccess, users = [] }: Props): JSX.Element {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [localUsers, setLocalUsers] = useState<UserRecord[]>(users);
  useEffect(() => {
    setLocalUsers(users);
  }, [users]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [priority, setPriority] = useState("");
  const [goalStatus, setGoalStatus] = useState<"PLANNED" | "IN_PROGRESS" | "COMPLETED">("PLANNED");
  const [responsibleId, setResponsibleId] = useState("");
  const [userModalOpen, setUserModalOpen] = useState(false);

  const userOptions = useMemo(
    () => localUsers.map((u) => ({ value: u.id, label: `${u.email} (${u.role})` })),
    [localUsers]
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setStatus("");
    const err: Record<string, string> = {};
    if (!title.trim()) err.title = "Informe o título.";
    const y = Number(year);
    if (!Number.isFinite(y) || y < 2020 || y > 2100) err.year = "Ano inválido.";
    if (!responsibleId) err.responsibleId = "Selecione ou crie um utilizador responsável.";
    setFieldErrors(err);
    if (Object.keys(err).length > 0) return;

    try {
      setBusy(true);
      await createGoal({
        title: title.trim(),
        description: description.trim() || undefined,
        year: y,
        status: goalStatus,
        priority: priority.trim() || undefined,
        responsibleId
      });
      setStatus("Meta cadastrada com sucesso.");
      setTitle("");
      setDescription("");
      setYear(String(new Date().getFullYear()));
      setPriority("");
      setGoalStatus("PLANNED");
      setResponsibleId("");
      onSuccess?.();
    } catch (error) {
      setStatus(String(error instanceof Error ? error.message : error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className="space-y-4" onSubmit={(event) => void onSubmit(event)}>
        <FormSection title="Meta" description="Título, ano e estado inicial. O responsável deve ser um utilizador do sistema.">
          <FormField label="Título" htmlFor="goal-title" required error={fieldErrors.title} className="sm:col-span-2">
            <input id="goal-title" className={formControlClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título da meta" />
          </FormField>
          <FormField label="Ano" htmlFor="goal-year" required error={fieldErrors.year}>
            <input id="goal-year" type="number" min={2020} max={2100} className={formControlClass} value={year} onChange={(e) => setYear(e.target.value)} />
          </FormField>
          <FormField label="Estado" htmlFor="goal-status" required>
            <select id="goal-status" className={formControlClass} value={goalStatus} onChange={(e) => setGoalStatus(e.target.value as typeof goalStatus)}>
              <option value="PLANNED">Planejada</option>
              <option value="IN_PROGRESS">Em andamento</option>
              <option value="COMPLETED">Concluída</option>
            </select>
          </FormField>
          <FormField label="Prioridade (opcional)" htmlFor="goal-priority">
            <input id="goal-priority" className={formControlClass} value={priority} onChange={(e) => setPriority(e.target.value)} placeholder="Ex.: Alta" />
          </FormField>
          <FormField label="Descrição (opcional)" htmlFor="goal-desc" className="sm:col-span-2">
            <textarea
              id="goal-desc"
              className={`${formControlClass} min-h-[72px] resize-y`}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalhes ou contexto"
            />
          </FormField>
        </FormSection>

        <FormSection title="Responsável" description="Quem acompanha a meta no sistema. Pode criar utilizador sem sair desta página.">
          <div className="sm:col-span-2">
            <EntitySelectWithCreate
              id="goal-responsible"
              label="Utilizador responsável"
              required
              value={responsibleId}
              onChange={(v) => {
                setResponsibleId(v);
                setFieldErrors((p) => {
                  const n = { ...p };
                  delete n.responsibleId;
                  return n;
                });
              }}
              options={userOptions}
              placeholder="Selecione…"
              addNewLabel="+ Novo utilizador"
              onAddNew={() => setUserModalOpen(true)}
              error={fieldErrors.responsibleId}
            />
          </div>
        </FormSection>

        {status ? (
          <p className={`text-sm ${status.includes("sucesso") ? "text-emerald-700" : "text-amber-800"}`} role="status">
            {status}
          </p>
        ) : null}

        <PrimaryButton type="submit" busy={busy} busyLabel="A guardar…">
          Cadastrar meta
        </PrimaryButton>
      </form>

      <Modal
        open={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        title="Novo utilizador"
        description="Após criar, o utilizador fica selecionado como responsável desta meta."
      >
        <UserForm
          onCreated={(u) => {
            setLocalUsers((prev) => [...prev.filter((x) => x.id !== u.id), u]);
            setResponsibleId(u.id);
            setUserModalOpen(false);
            setFieldErrors((p) => {
              const n = { ...p };
              delete n.responsibleId;
              return n;
            });
          }}
          submitLabel="Criar e usar nesta meta"
        />
      </Modal>
    </>
  );
}
