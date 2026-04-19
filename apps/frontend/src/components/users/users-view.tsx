"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { UserRecord } from "@/lib/api";
import { updateUser } from "@/lib/api";
import { UserForm } from "@/components/actions/user-form";
import { Modal } from "@/components/ui/modal";
import { FormField, PrimaryButton, SecondaryButton, buttonPrimaryClass, formControlClass } from "@/components/ui/form-primitives";
import { DataLoadAlert } from "@/components/ui/data-load-alert";

const roleLabel: Record<string, string> = {
  ADMIN: "Administrador",
  EDITOR: "Editor",
  VIEWER: "Leitura"
};

type Props = {
  users: UserRecord[];
  dataLoadErrors?: string[];
};

export function UsersView({ users: initialUsers, dataLoadErrors = [] }: Props): JSX.Element {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRecord | null>(null);
  const [editRole, setEditRole] = useState<string>("EDITOR");
  const [editPassword, setEditPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  async function saveEdit(): Promise<void> {
    if (!editUser) return;
    setBusy(true);
    setMsg(null);
    try {
      await updateUser(editUser.id, {
        role: editRole as "ADMIN" | "EDITOR" | "VIEWER",
        ...(editPassword.trim().length >= 8 ? { password: editPassword.trim() } : {})
      });
      setEditUser(null);
      setEditPassword("");
      refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao atualizar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {dataLoadErrors.length > 0 ? <DataLoadAlert messages={dataLoadErrors} /> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Utilizadores</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Gestão de contas e papéis. Apenas administradores podem criar ou alterar utilizadores.
          </p>
        </div>
        <button type="button" onClick={() => setCreateOpen(true)} className={buttonPrimaryClass}>
          <span className="text-lg leading-none" aria-hidden>
            +
          </span>
          Novo utilizador
        </button>
      </div>

      <section className="overflow-hidden border border-slate-200/90 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <span className="text-sm font-medium text-slate-700">Contas</span>
          <span className="tabular-nums text-xs font-medium uppercase tracking-wide text-slate-400">
            {initialUsers.length} {initialUsers.length === 1 ? "registro" : "registros"}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">E-mail</th>
                <th className="px-5 py-3">Papel</th>
                <th className="px-5 py-3">Criado em</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {initialUsers.map((u) => (
                <tr key={u.id} className="transition hover:bg-slate-50/60">
                  <td className="px-5 py-3 font-medium text-slate-900">{u.email}</td>
                  <td className="px-5 py-3 text-slate-700">{roleLabel[u.role] ?? u.role}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-slate-600">
                    {new Date(u.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      type="button"
                      className="text-sm font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900"
                      onClick={() => {
                        setEditUser(u);
                        setEditRole(u.role);
                        setEditPassword("");
                        setMsg(null);
                      }}
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
              {initialUsers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-14 text-center text-sm text-slate-500">
                    Nenhum utilizador listado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Novo utilizador" description="E-mail único no sistema e palavra-passe com pelo menos 8 caracteres.">
        <UserForm
          onSuccess={() => {
            setCreateOpen(false);
            refresh();
          }}
        />
      </Modal>

      <Modal
        open={Boolean(editUser)}
        onClose={() => {
          setEditUser(null);
          setMsg(null);
        }}
        title="Editar utilizador"
        description={editUser ? editUser.email : ""}
      >
        {editUser ? (
          <div className="space-y-4">
            <FormField label="Papel" htmlFor="edit-user-role">
              <select
                id="edit-user-role"
                className={formControlClass}
                value={editRole}
                onChange={(e) => setEditRole(e.target.value)}
              >
                <option value="VIEWER">Leitura (VIEWER)</option>
                <option value="EDITOR">Edição (EDITOR)</option>
                <option value="ADMIN">Administrador (ADMIN)</option>
              </select>
            </FormField>
            <FormField label="Nova palavra-passe (opcional)" htmlFor="edit-user-pass" hint="Mínimo 8 caracteres se preencher.">
              <input
                id="edit-user-pass"
                type="password"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                minLength={8}
                className={formControlClass}
                placeholder="Deixe vazio para manter a atual"
                autoComplete="new-password"
              />
            </FormField>
            {msg ? <p className="text-sm text-red-600">{msg}</p> : null}
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <SecondaryButton type="button" onClick={() => setEditUser(null)}>
                Cancelar
              </SecondaryButton>
              <PrimaryButton type="button" busy={busy} busyLabel="A guardar…" onClick={() => void saveEdit()}>
                Guardar
              </PrimaryButton>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
