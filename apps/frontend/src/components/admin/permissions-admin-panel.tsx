"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Plus, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { AccessProfileRecord, PermissionGrant, PermissionHistoryEntry, UserRecord } from "@/lib/api";
import {
  createAccessProfile,
  getAccessProfiles,
  getProfilePermissionHistory,
  getProfilePermissions,
  getUserPermissionHistory,
  getUserPermissions,
  getUsers,
  updateAccessProfile,
  updateProfilePermissions,
  updateUserPermissions
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { ALL_PERMISSION_KEYS, PERMISSION_MODULES } from "@/components/admin/permission-modules";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type TargetMode = "profile" | "user";

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
  const [mode, setMode] = useState<TargetMode>("profile");
  const [profileId, setProfileId] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [userProfileId, setUserProfileId] = useState<string>("");
  const [newProfileName, setNewProfileName] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(PERMISSION_MODULES.map((m) => [m.id, true]))
  );
  const [localGrants, setLocalGrants] = useState<Record<string, boolean>>(() => grantsToMap([]));
  const [inheritedKeys, setInheritedKeys] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);

  const profilesQuery = useQuery({
    queryKey: queryKeys.accessProfiles,
    queryFn: () => getAccessProfiles(true)
  });

  const { data: users = [] } = useQuery({
    queryKey: queryKeys.users,
    queryFn: getUsers
  });

  const profiles = profilesQuery.data ?? [];
  const activeProfiles = useMemo(() => profiles.filter((p) => p.active), [profiles]);

  const approvedUsers = useMemo(
    () => users.filter((u) => u.approvalStatus !== "PENDING" && u.approvalStatus !== "REJECTED"),
    [users]
  );

  const selectedUser = useMemo(() => approvedUsers.find((u) => u.id === userId), [approvedUsers, userId]);
  const userLinkedProfiles = selectedUser?.profiles ?? [];

  useEffect(() => {
    if (!profileId && activeProfiles.length > 0) {
      setProfileId(activeProfiles[0]!.id);
    }
  }, [profileId, activeProfiles]);

  useEffect(() => {
    if (mode === "user" && !userId && approvedUsers.length > 0) {
      setUserId(approvedUsers[0]!.id);
    }
  }, [mode, userId, approvedUsers]);

  useEffect(() => {
    if (mode !== "user") return;
    const first = userLinkedProfiles[0]?.id ?? "";
    if (!userProfileId || !userLinkedProfiles.some((p) => p.id === userProfileId)) {
      setUserProfileId(first);
    }
  }, [mode, userLinkedProfiles, userProfileId]);

  const matrixProfileId = mode === "profile" ? profileId : userProfileId;

  const profileQuery = useQuery({
    queryKey: queryKeys.profilePermissions(matrixProfileId),
    queryFn: () => getProfilePermissions(matrixProfileId),
    enabled: mode === "profile" && Boolean(matrixProfileId)
  });

  const userQuery = useQuery({
    queryKey: queryKeys.userPermissions(userId, userProfileId),
    queryFn: () => getUserPermissions(userId, userProfileId),
    enabled: mode === "user" && Boolean(userId) && Boolean(userProfileId)
  });

  const activeQuery = mode === "profile" ? profileQuery : userQuery;
  const historyQuery = useQuery({
    queryKey: ["gestao", "admin", "permission-history", mode, mode === "profile" ? profileId : userId],
    queryFn: () =>
      mode === "profile" ? getProfilePermissionHistory(profileId) : getUserPermissionHistory(userId),
    enabled: mode === "profile" ? Boolean(profileId) : Boolean(userId)
  });

  useEffect(() => {
    if (!activeQuery.data) return;
    if (mode === "user") {
      const userData = activeQuery.data as {
        permissions: PermissionGrant[];
        inheritedKeys?: string[];
      };
      const inherited = new Set<string>(userData.inheritedKeys ?? []);
      setInheritedKeys(inherited);
      const map = grantsToMap(userData.permissions);
      for (const key of inherited) {
        if (!map[key]) map[key] = true;
      }
      setLocalGrants(map);
    } else {
      setInheritedKeys(new Set());
      setLocalGrants(grantsToMap(activeQuery.data.permissions));
    }
    setDirty(false);
  }, [activeQuery.data, mode]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (mode === "profile") {
        if (!profileId) throw new Error("Selecione um perfil");
        return updateProfilePermissions(profileId, mapToGrants(localGrants));
      }
      if (!userId || !userProfileId) throw new Error("Selecione usuário e perfil");
      // Salvar apenas extras (não herdadas)
      const extras = mapToGrants(localGrants).filter(
        (g) => g.granted && !inheritedKeys.has(g.permissionKey)
      );
      return updateUserPermissions(userId, extras, userProfileId);
    },
    onSuccess: () => {
      toast.success("Permissões salvas.");
      setDirty(false);
      if (mode === "profile") {
        void qc.invalidateQueries({ queryKey: queryKeys.profilePermissions(profileId) });
      } else {
        void qc.invalidateQueries({ queryKey: queryKeys.userPermissions(userId, userProfileId) });
      }
      void qc.invalidateQueries({ queryKey: ["gestao", "admin", "permission-history"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar permissões")
  });

  const createProfileMutation = useMutation({
    mutationFn: () => createAccessProfile({ name: newProfileName.trim() }),
    onSuccess: (created) => {
      toast.success("Perfil criado.");
      setNewProfileName("");
      void qc.invalidateQueries({ queryKey: queryKeys.accessProfiles });
      setProfileId(created.id);
      setMode("profile");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao criar perfil")
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (profile: AccessProfileRecord) =>
      updateAccessProfile(profile.id, { active: !profile.active }),
    onSuccess: () => {
      toast.success("Perfil atualizado.");
      void qc.invalidateQueries({ queryKey: queryKeys.accessProfiles });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao atualizar perfil")
  });

  const toggleKey = useCallback(
    (key: string, granted: boolean) => {
      if (mode === "user" && inheritedKeys.has(key) && !granted) {
        toast.message("Permissão herdada do perfil. Remova-a na matriz do perfil, se necessário.");
        return;
      }
      setLocalGrants((prev) => ({ ...prev, [key]: granted }));
      setDirty(true);
    },
    [inheritedKeys, mode]
  );

  const toggleModule = useCallback(
    (moduleId: string, granted: boolean) => {
      const mod = PERMISSION_MODULES.find((m) => m.id === moduleId);
      if (!mod) return;
      setLocalGrants((prev) => {
        const next = { ...prev };
        for (const p of mod.permissions) {
          if (mode === "user" && inheritedKeys.has(p.key) && !granted) continue;
          next[p.key] = granted;
        }
        return next;
      });
      setDirty(true);
    },
    [inheritedKeys, mode]
  );

  const selectedProfile = profiles.find((p) => p.id === profileId);
  const loadError = activeQuery.error instanceof Error ? activeQuery.error.message : null;

  return (
    <div className="space-y-4">
      {loadError ? <DataLoadAlert messages={[loadError]} title="Não foi possível carregar permissões" /> : null}
      {profilesQuery.error ? (
        <DataLoadAlert
          messages={[profilesQuery.error instanceof Error ? profilesQuery.error.message : "Erro ao carregar perfis"]}
          title="Perfis de acesso"
        />
      ) : null}

      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <h3 className="font-medium text-foreground">Perfis de acesso</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Crie perfis customizados ou gerencie os de sistema (Administrador, Editor e Leitor). Perfis em uso não podem
          ser excluídos — apenas inativados.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Input
            className="max-w-xs"
            placeholder="Nome do novo perfil"
            value={newProfileName}
            onChange={(e) => setNewProfileName(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            className="gap-1"
            disabled={!newProfileName.trim() || createProfileMutation.isPending}
            onClick={() => createProfileMutation.mutate()}
          >
            <Plus className="h-4 w-4" />
            Criar perfil
          </Button>
        </div>
        <ul className="mt-3 space-y-2">
          {profiles.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
            >
              <button
                type="button"
                className="text-left font-medium hover:text-primary"
                onClick={() => {
                  setMode("profile");
                  setProfileId(p.id);
                }}
              >
                {p.name}
                {p.systemKey ? <span className="text-muted-foreground"> · {p.systemKey}</span> : null}
                {!p.active ? <span className="ml-2 text-xs text-amber-700">Inativo</span> : null}
                <span className="ml-2 text-xs text-muted-foreground">{p.userCount} usuário(s)</span>
              </button>
              {!p.protected ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={toggleActiveMutation.isPending}
                  onClick={() => toggleActiveMutation.mutate(p)}
                >
                  {p.active ? "Inativar" : "Ativar"}
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">Protegido</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={mode === "profile" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("profile")}
          >
            Por perfil
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
          {mode === "profile" ? (
            <Select value={profileId || undefined} onValueChange={setProfileId}>
              <SelectTrigger className="w-[240px]">
                <SelectValue placeholder="Perfil" />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {!p.active ? " (inativo)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <>
              <Select value={userId || undefined} onValueChange={setUserId}>
                <SelectTrigger className="w-[240px]">
                  <SelectValue placeholder="Usuário" />
                </SelectTrigger>
                <SelectContent>
                  {approvedUsers.map((u: UserRecord) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={userProfileId || undefined} onValueChange={setUserProfileId}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Perfil vinculado" />
                </SelectTrigger>
                <SelectContent>
                  {userLinkedProfiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
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
        {mode === "profile"
          ? "A matriz do perfil define as permissões herdadas por todos os usuários vinculados."
          : "Permissões adicionais somam-se às herdadas do perfil selecionado. Herdadas aparecem marcadas e não podem ser desmarcadas aqui."}
      </p>
      {mode === "profile" && selectedProfile?.systemKey === "ADMIN" ? (
        <p className="text-sm text-muted-foreground">
          As permissões para gerir usuários e permissões não podem ser removidas do perfil Administrador.
        </p>
      ) : null}

      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="font-medium text-foreground">Histórico da matriz</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Últimas alterações em{" "}
              {mode === "profile" ? "permissões do perfil" : "permissões adicionais do usuário"}.
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
      ) : mode === "user" && !userProfileId ? (
        <p className="text-sm text-muted-foreground">Este usuário não possui perfis vinculados.</p>
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
                    {mod.permissions.map((perm) => {
                      const inherited = mode === "user" && inheritedKeys.has(perm.key);
                      return (
                        <li key={perm.key} className="flex items-center gap-2 pl-7">
                          <Checkbox
                            id={`perm-${perm.key}`}
                            checked={localGrants[perm.key] ?? false}
                            disabled={inherited}
                            onCheckedChange={(v) => toggleKey(perm.key, v === true)}
                          />
                          <label htmlFor={`perm-${perm.key}`} className="cursor-pointer text-sm">
                            {perm.label}
                            <span className="ml-2 font-mono text-xs text-muted-foreground">{perm.key}</span>
                            {inherited ? (
                              <span className="ml-2 text-xs text-muted-foreground">(herdada)</span>
                            ) : null}
                          </label>
                        </li>
                      );
                    })}
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
