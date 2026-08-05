"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, RotateCcw, Save, Search, Shield } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { AuditEventConfigModule, AuditEventConfigItem } from "@/lib/api";
import {
  getAuditEventConfig,
  restoreAuditEventConfigDefaults,
  saveAuditEventConfig
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type LocalEvent = AuditEventConfigItem;

function cloneModules(modules: AuditEventConfigModule[]): AuditEventConfigModule[] {
  return modules.map((m) => ({
    ...m,
    events: m.events.map((e) => ({ ...e }))
  }));
}

export function AuditEventConfigPanel(): JSX.Element {
  const [local, setLocal] = useState<AuditEventConfigModule[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const query = useQuery({
    queryKey: queryKeys.auditEventConfig,
    queryFn: getAuditEventConfig
  });

  useEffect(() => {
    if (!query.data) return;
    setLocal(cloneModules(query.data.modules));
    setExpanded((prev) => {
      const next = { ...prev };
      for (const mod of query.data.modules) {
        if (next[mod.moduleKey] === undefined) next[mod.moduleKey] = true;
      }
      return next;
    });
  }, [query.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return local;
    return local
      .map((mod) => {
        const events = mod.events.filter(
          (e) =>
            e.label.toLowerCase().includes(q) ||
            e.actionKey.toLowerCase().includes(q) ||
            e.screenKey.toLowerCase().includes(q) ||
            mod.moduleLabel.toLowerCase().includes(q)
        );
        return { ...mod, events };
      })
      .filter((mod) => mod.events.length > 0);
  }, [local, search]);

  const dirtySummary = useMemo(() => {
    if (!query.data) return { changed: 0, enable: 0, disable: 0, detail: 0 };
    const original = new Map<string, LocalEvent>();
    for (const mod of query.data.modules) {
      for (const e of mod.events) original.set(e.id, e);
    }
    let changed = 0;
    let enable = 0;
    let disable = 0;
    let detail = 0;
    for (const mod of local) {
      for (const e of mod.events) {
        const prev = original.get(e.id);
        if (!prev) continue;
        if (prev.enabled !== e.enabled || prev.detailLevel !== e.detailLevel) {
          changed += 1;
          if (prev.enabled !== e.enabled) {
            if (e.enabled) enable += 1;
            else disable += 1;
          }
          if (prev.detailLevel !== e.detailLevel) detail += 1;
        }
      }
    }
    return { changed, enable, disable, detail };
  }, [local, query.data]);

  const setEvent = (id: string, patch: Partial<LocalEvent>) => {
    setLocal((mods) =>
      mods.map((mod) => ({
        ...mod,
        events: mod.events.map((e) => {
          if (e.id !== id) return e;
          if (e.mandatory && patch.enabled === false) return e;
          return { ...e, ...patch, enabled: e.mandatory ? true : (patch.enabled ?? e.enabled) };
        })
      }))
    );
  };

  const toggleModule = (moduleKey: string, enabled: boolean) => {
    setLocal((mods) =>
      mods.map((mod) => {
        if (mod.moduleKey !== moduleKey) return mod;
        return {
          ...mod,
          events: mod.events.map((e) => (e.mandatory ? e : { ...e, enabled }))
        };
      })
    );
  };

  const collectItems = () =>
    local.flatMap((mod) =>
      mod.events.map((e) => ({
        id: e.id,
        enabled: e.enabled,
        detailLevel: e.detailLevel
      }))
    );

  const onConfirmSave = async () => {
    setSaving(true);
    try {
      const result = await saveAuditEventConfig({ items: collectItems() });
      toast.success(
        `Configuração salva: ${result.summary.enabled} ativos, ${result.summary.disabled} inativos (${result.summary.changed} alterações).`
      );
      setConfirmOpen(false);
      await query.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar configuração de auditoria.");
    } finally {
      setSaving(false);
    }
  };

  const onRestore = async () => {
    if (!window.confirm("Restaurar o padrão de eventos de auditoria? As preferências atuais serão substituídas.")) {
      return;
    }
    setRestoring(true);
    try {
      const result = await restoreAuditEventConfigDefaults();
      toast.success(`Padrão restaurado (${result.summary.restored} ajustes).`);
      await query.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao restaurar padrão.");
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Card className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Shield className="h-5 w-5 text-primary" aria-hidden />
            Configuração de auditoria
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Escolha quais eventos são gravados e o nível de detalhe. Eventos obrigatórios (login, logout,
            permissões, criação de usuário e esta própria configuração) permanecem sempre ativos.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={restoring} onClick={() => void onRestore()}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Restaurar padrão
          </Button>
          <Button
            type="button"
            disabled={dirtySummary.changed === 0 || saving}
            onClick={() => setConfirmOpen(true)}
          >
            <Save className="mr-2 h-4 w-4" />
            Salvar
          </Button>
        </div>
      </div>

      {query.isError ? (
        <DataLoadAlert
          title="Não foi possível carregar a configuração de auditoria"
          messages={[query.error instanceof Error ? query.error.message : "Erro desconhecido"]}
        />
      ) : null}

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Pesquisar módulo, tela ou ação…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="space-y-3">
        {filtered.map((mod) => {
          const isOpen = expanded[mod.moduleKey] ?? true;
          const toggleable = mod.events.filter((e) => !e.mandatory);
          const allChecked = toggleable.length > 0 && toggleable.every((e) => e.enabled);
          const someChecked = toggleable.some((e) => e.enabled);

          return (
            <section key={mod.moduleKey} className="rounded-xl border bg-card shadow-sm">
              <div className="flex items-center gap-3 border-b px-4 py-3">
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setExpanded((e) => ({ ...e, [mod.moduleKey]: !isOpen }))}
                  aria-expanded={isOpen}
                >
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <Checkbox
                  checked={allChecked ? true : someChecked ? "indeterminate" : false}
                  disabled={toggleable.length === 0}
                  onCheckedChange={(v) => toggleModule(mod.moduleKey, v === true)}
                  aria-label={`Marcar módulo ${mod.moduleLabel}`}
                />
                <span className="font-medium text-foreground">{mod.moduleLabel}</span>
                <span className="text-xs text-muted-foreground">
                  {mod.events.filter((e) => e.enabled).length}/{mod.events.length} ativos
                </span>
              </div>
              {isOpen ? (
                <ul className="m-0 list-none space-y-3 p-4 pt-3">
                  {mod.events.map((ev) => (
                    <li
                      key={ev.id}
                      className="flex flex-col gap-2 rounded-md border border-transparent px-2 py-1 hover:border-border sm:flex-row sm:items-center sm:justify-between"
                    >
                      <label className="flex items-start gap-2 text-sm">
                        <Checkbox
                          checked={ev.enabled}
                          disabled={ev.mandatory}
                          onCheckedChange={(v) => setEvent(ev.id, { enabled: v === true })}
                        />
                        <span>
                          <span className="font-medium">{ev.label}</span>
                          <span className="ml-2 font-mono text-xs text-muted-foreground">
                            {ev.screenKey}.{ev.actionKey}
                          </span>
                          {ev.mandatory ? (
                            <span className="ml-2 text-xs text-amber-700 dark:text-amber-400">
                              (obrigatório)
                            </span>
                          ) : null}
                        </span>
                      </label>
                      <div className="w-full sm:w-56">
                        <Select
                          value={ev.detailLevel}
                          onValueChange={(v) =>
                            setEvent(ev.id, {
                              detailLevel: v === "ACTION_ONLY" ? "ACTION_ONLY" : "ACTION_AND_VALUES"
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ACTION_ONLY">Somente ação</SelectItem>
                            <SelectItem value="ACTION_AND_VALUES">Ação e valores</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          );
        })}
        {!query.isLoading && filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum evento corresponde à pesquisa.</p>
        ) : null}
      </div>

      <Card className="space-y-2 border-dashed p-4 opacity-70">
        <h3 className="text-sm font-semibold text-foreground">Armazenamento e retenção (em breve)</h3>
        <p className="text-sm text-muted-foreground">
          Políticas legais de descarte e retenção de logs serão configuradas em uma evolução futura
          (ticket 69). Nesta versão a seção permanece desabilitada.
        </p>
        <Button type="button" variant="outline" size="sm" disabled>
          Configurar retenção
        </Button>
      </Card>

      <Modal
        open={confirmOpen}
        onClose={() => !saving && setConfirmOpen(false)}
        title="Confirmar alteração da configuração de auditoria"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Revise o resumo antes de gravar. A própria alteração será registrada na auditoria.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>{dirtySummary.changed} evento(s) alterado(s)</li>
            <li>{dirtySummary.enable} habilitado(s)</li>
            <li>{dirtySummary.disable} desabilitado(s)</li>
            <li>{dirtySummary.detail} com mudança de nível de detalhe</li>
          </ul>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={saving} onClick={() => void onConfirmSave()}>
              {saving ? "Salvando…" : "Confirmar e salvar"}
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
