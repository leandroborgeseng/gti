"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { UserRecord } from "@/lib/api";
import { updateUser } from "@/lib/api";
import { UserForm } from "@/components/actions/user-form";
import { Modal } from "@/components/ui/modal";

const btnPrimary =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2";

const roleLabel: Record<string, string> = {
  ADMIN: "Administrador",
  EDITOR: "Editor",
  VIEWER: "Leitura"
};

type Props = {
  users: UserRecord[];
};

export function UsersView({ users: initialUsers }: Props): JSX.Element {
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Utilizadores</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Gestão de contas e papéis. Apenas administradores podem criar ou alterar utilizadores.
          </p>
        </div>
        <button type="button" onClick={() => setCreateOpen(true)} className={btnPrimary}>
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
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-700">Papel</span>
              <select
                className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={editRole}
                onChange={(e) => setEditRole(e.target.value)}
              >
                <option value="VIEWER">Leitura (VIEWER)</option>
                <option value="EDITOR">Edição (EDITOR)</option>
                <option value="ADMIN">Administrador (ADMIN)</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-700">Nova palavra-passe (opcional)</span>
              <input
                type="password"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                minLength={8}
                className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                placeholder="Deixe vazio para manter a atual"
                autoComplete="new-password"
              />
            </label>
            {msg ? <p className="text-sm text-red-600">{msg}</p> : null}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="rounded-md border border-slate-200 px-3 py-2 text-sm" onClick={() => setEditUser(null)}>
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                onClick={() => void saveEdit()}
              >
                {busy ? "A guardar…" : "Guardar"}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
