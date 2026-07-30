"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { PermissionGrant, PermissionHistoryEntry, UserRecord } from "@/lib/api";
import {
  getRolePermissionHistory,
  getRolePermissions,
  getUserPermissionHistory,
  getUserPermissions,
  getUsers,
  updateRolePermissions,
  updateUserPermissions
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { ALL_PERMISSION_KEYS, PERMISSION_MODULES } from "@/components/admin/permission-modules";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type TargetMode = "role" | "user";

const ROLE_OPTIONS = [
  { value: "ADMIN", label: "Administrador" },
  { value: "EDITOR", label: "Editor" },
  { value: "VIEWER", label: "Leitor" }
] as const;

function grantsToMap(grants: PermissionGrant[]): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const key of ALL_PERMISSION_KEYS) {
    map[key] = false;
  }
  for (const g of grants) {
    map[g.permissionKey] = g.granted;
  }
  return map;
}

function mapToGrants(map: Record<string, boolean>): PermissionGrant[] {
  return ALL_PERMISSION_KEYS.map((permissionKey) => ({
    permissionKey,
    granted: map[permissionKey] ?? false
  }));
}

function permissionHistorySummary(entry: PermissionHistoryEntry): string {
  const oldKeys = new Set(entry.oldData?.keys ?? []);
  const newKeys = new Set(entry.newData?.keys ?? []);
  const added = [...newKeys].filter((key) => !oldKeys.has(key));
  const removed = [...oldKeys].filter((key) => !newKeys.has(key));
  const describe = (keys: string[]) => keys.slice(0, 3).join(", ") + (keys.length > 3 ? ` e mais ${keys.length - 3}` : "");
  if (added.length === 0 && removed.length === 0) return "Nenhuma alteração nas chaves.";
  return [
    added.length > 0 ? `Adicionadas: ${describe(added)}` : null,
    removed.length > 0 ? `Removidas: ${describe(removed)}` : null
  ]
    .filter(Boolean)
    .join(" · ");
}

function formatHistoryTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function PermissionsAdminPanel(): JSX.Element {
  const qc = useQueryClient();
  const [mode, setMode] = useState<TargetMode>("role");
  const [role, setRole] = useState<"ADMIN" | "EDITOR" | "VIEWER">("ADMIN");
  const [userId, setUserId] = useState<string>("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(PERMISSION_MODULES.map((m) => [m.id, true]))
  );
  const [localGrants, setLocalGrants] = useState<Record<string, boolean>>(() => grantsToMap([]));
  const [dirty, setDirty] = useState(false);

  const { data: users = [] } = useQuery({
    queryKey: queryKeys.users,
    queryFn: getUsers
  });

  const approvedUsers = useMemo(
    () => users.filter((u) => u.approvalStatus !== "PENDING" && u.approvalStatus !== "REJECTED"),
    [users]
  );

  useEffect(() => {
    if (mode === "user" && !userId && approvedUsers.length > 0) {
      setUserId(approvedUsers[0]!.id);
    }
  }, [mode, userId, approvedUsers]);

  const roleQuery = useQuery({
    queryKey: queryKeys.rolePermissions(role),
    queryFn: () => getRolePermissions(role),
    enabled: mode === "role"
  });

  const userQuery = useQuery({
    queryKey: queryKeys.userPermissions(userId),
    queryFn: () => getUserPermissions(userId),
    enabled: mode === "user" && Boolean(userId)
  });

  const activeQuery = mode === "role" ? roleQuery : userQuery;
  const historyQuery = useQuery({
    queryKey: ["gestao", "admin", "permission-history", mode, mode === "role" ? role : userId],
    queryFn: () => (mode === "role" ? getRolePermissionHistory(role) : getUserPermissionHistory(userId)),
    enabled: mode === "role" || Boolean(userId)
  });

  useEffect(() => {
    if (!activeQuery.data) return;
    setLocalGrants(grantsToMap(activeQuery.data.permissions));
    setDirty(false);
  }, [activeQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = mapToGrants(localGrants);
      if (mode === "role") {
        return updateRolePermissions(role, payload);
      }
      if (!userId) throw new Error("Selecione um usuário");
      return updateUserPermissions(userId, payload);
    },
    onSuccess: () => {
      toast.success("Permissões salvas.");
      setDirty(false);
      if (mode === "role") {
        void qc.invalidateQueries({ queryKey: queryKeys.rolePermissions(role) });
      } else {
        void qc.invalidateQueries({ queryKey: queryKeys.userPermissions(userId) });
      }
      void qc.invalidateQueries({ queryKey: ["gestao", "admin", "permission-history"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar permissões")
  });

  const toggleKey = useCallback((key: string, granted: boolean) => {
    setLocalGrants((prev) => ({ ...prev, [key]: granted }));
    setDirty(true);
  }, []);

  const toggleModule = useCallback((moduleId: string, granted: boolean) => {
    const mod = PERMISSION_MODULES.find((m) => m.id === moduleId);
    if (!mod) return;
    setLocalGrants((prev) => {
      const next = { ...prev };
      for (const p of mod.permissions) {
        next[p.key] = granted;
      }
      return next;
    });
    setDirty(true);
  }, []);

  const loadError = activeQuery.error instanceof Error ? activeQuery.error.message : null;

  return (
    <div className="space-y-4">
      {loadError ? <DataLoadAlert messages={[loadError]} title="Não foi possível carregar permissões" /> : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={mode === "role" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("role")}
          >
            Por papel
          </Button>
          <Button
            type="button"
            variant={mode === "user" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("user")}
          >
            Por usuário
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {mode === "role" ? (
            <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Papel" />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Select value={userId || undefined} onValueChange={setUserId}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Selecione o usuário" />
              </SelectTrigger>
              <SelectContent>
                {approvedUsers.map((u: UserRecord) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            type="button"
            className="gap-2"
            disabled={!dirty || saveMutation.isPending || activeQuery.isLoading}
            onClick={() => saveMutation.mutate()}
          >
            <Save className="h-4 w-4" />
            {saveMutation.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Permissões por usuário somam-se ao papel base. Marque ou desmarque por módulo ou permissão individual.
      </p>
      {mode === "role" && role === "ADMIN" ? (
        <p className="text-sm text-muted-foreground">
          As permissões para gerir usuários e permissões não podem ser removidas do papel Administrador.
        </p>
      ) : null}

      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="font-medium text-foreground">Histórico da matriz</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Últimas alterações em {mode === "role" ? `permissões do papel ${role}` : "permissões adicionais do usuário"}.
            </p>
          </div>
          <span className="text-xs text-muted-foreground">{historyQuery.data?.length ?? 0} registros</span>
        </div>
        {historyQuery.isLoading ? (
          <p className="mt-3 text-sm text-muted-foreground">Carregando histórico…</p>
        ) : historyQuery.error ? (
          <p className="mt-3 text-sm text-destructive">Não foi possível carregar o histórico.</p>
        ) : historyQuery.data?.length ? (
          <ul className="mt-3 space-y-2">
            {historyQuery.data.map((entry) => (
              <li key={entry.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                    {entry.action === "REPLACE" ? "Matriz substituída" : entry.action}
                  </span>
                  <span className="text-xs text-slate-500">{formatHistoryTimestamp(entry.timestamp)}</span>
                </div>
                <p className="mt-2 text-xs text-slate-600">{permissionHistorySummary(entry)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Nenhuma alteração auditada ainda.</p>
        )}
      </section>

      {activeQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando permissões…</p>
      ) : (
        <div className="space-y-3">
          {PERMISSION_MODULES.map((mod) => {
            const moduleKeys = mod.permissions.map((p) => p.key);
            const allChecked = moduleKeys.every((k) => localGrants[k]);
            const someChecked = moduleKeys.some((k) => localGrants[k]);
            const isOpen = expanded[mod.id] ?? true;

            return (
              <section key={mod.id} className="rounded-xl border bg-card shadow-sm">
                <div className="flex items-center gap-3 border-b px-4 py-3">
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setExpanded((e) => ({ ...e, [mod.id]: !isOpen }))}
                    aria-expanded={isOpen}
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <Checkbox
                    checked={allChecked ? true : someChecked ? "indeterminate" : false}
                    onCheckedChange={(v) => toggleModule(mod.id, v === true)}
                    aria-label={`Marcar módulo ${mod.label}`}
                  />
                  <span className="font-medium text-foreground">{mod.label}</span>
                </div>
                {isOpen ? (
                  <ul className="m-0 list-none space-y-2 p-4 pt-3">
                    {mod.permissions.map((perm) => (
                      <li key={perm.key} className="flex items-center gap-2 pl-7">
                        <Checkbox
                          id={`perm-${perm.key}`}
                          checked={localGrants[perm.key] ?? false}
                          onCheckedChange={(v) => toggleKey(perm.key, v === true)}
                        />
                        <label htmlFor={`perm-${perm.key}`} className="cursor-pointer text-sm">
                          {perm.label}
                          <span className="ml-2 font-mono text-xs text-muted-foreground">{perm.key}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
