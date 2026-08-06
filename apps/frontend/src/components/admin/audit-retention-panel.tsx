"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Database, Play, Save, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { AuditRetentionPolicyItem } from "@/lib/api";
import {
  dryRunAuditRetention,
  executeAuditRetentionDiscard,
  getAuditRetentionPolicies,
  getAuditRetentionRuns,
  getAuditStorageIndicators,
  saveAuditRetentionPolicies
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR");
}

type LocalPolicy = AuditRetentionPolicyItem;

export function AuditRetentionPanel(): JSX.Element {
  const qc = useQueryClient();
  const [local, setLocal] = useState<LocalPolicy[]>([]);
  const [saving, setSaving] = useState(false);
  const [busyJob, setBusyJob] = useState<"dry" | "exec" | null>(null);
  const [confirmExec, setConfirmExec] = useState(false);
  const [lastDryPreview, setLastDryPreview] = useState<number | null>(null);

  const indicatorsQ = useQuery({
    queryKey: queryKeys.auditRetentionIndicators,
    queryFn: getAuditStorageIndicators
  });
  const policiesQ = useQuery({
    queryKey: queryKeys.auditRetention,
    queryFn: getAuditRetentionPolicies
  });
  const runsQ = useQuery({
    queryKey: queryKeys.auditRetentionRuns,
    queryFn: () => getAuditRetentionRuns(10)
  });

  useEffect(() => {
    if (!policiesQ.data) return;
    setLocal(policiesQ.data.policies.map((p) => ({ ...p })));
  }, [policiesQ.data]);

  const dirty = useMemo(() => {
    const server = policiesQ.data?.policies ?? [];
    if (server.length !== local.length) return false;
    return local.some((p) => {
      const s = server.find((x) => x.id === p.id);
      if (!s) return true;
      return s.retentionDays !== p.retentionDays || s.active !== p.active;
    });
  }, [local, policiesQ.data]);

  const indicators = indicatorsQ.data;
  const alertText = policiesQ.data?.validationAlert;

  async function onSave(): Promise<void> {
    setSaving(true);
    try {
      const result = await saveAuditRetentionPolicies({
        items: local.map((p) => ({
          id: p.id,
          retentionDays: p.retentionDays,
          active: p.active
        }))
      });
      toast.success(
        result.changed > 0
          ? `Políticas salvas (${result.changed} alterada(s)).`
          : "Nenhuma alteração nas políticas."
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.auditRetention }),
        qc.invalidateQueries({ queryKey: queryKeys.auditRetentionIndicators })
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar políticas.");
    } finally {
      setSaving(false);
    }
  }

  async function onDryRun(): Promise<void> {
    setBusyJob("dry");
    try {
      const result = await dryRunAuditRetention();
      setLastDryPreview(result.previewCount);
      if (result.status === "BLOCKED") {
        toast.message(result.message);
      } else {
        toast.success(result.message);
      }
      await qc.invalidateQueries({ queryKey: queryKeys.auditRetentionRuns });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na simulação.");
    } finally {
      setBusyJob(null);
    }
  }

  async function onExecute(): Promise<void> {
    setBusyJob("exec");
    try {
      const result = await executeAuditRetentionDiscard();
      toast.success(result.message);
      setConfirmExec(false);
      setLastDryPreview(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.auditRetentionRuns }),
        qc.invalidateQueries({ queryKey: queryKeys.auditRetentionIndicators }),
        qc.invalidateQueries({ queryKey: ["gestao", "admin", "audit-logs"] })
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao executar descarte.");
    } finally {
      setBusyJob(null);
    }
  }

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Database className="h-4 w-4" aria-hidden />
            Armazenamento e retenção
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Indicadores de volume e políticas por categoria. O descarte permanece{" "}
            <strong>desligado por padrão</strong> até ativar políticas com validação da área competente.
          </p>
        </div>
      </div>

      {indicatorsQ.isError ? (
        <DataLoadAlert
          messages={[
            indicatorsQ.error instanceof Error
              ? indicatorsQ.error.message
              : "Não foi possível carregar os indicadores."
          ]}
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
          <p className="text-xs text-muted-foreground">Total AuditLog</p>
          <p className="text-lg font-semibold tabular-nums">
            {indicators?.totalAuditLogs.toLocaleString("pt-BR") ?? "—"}
          </p>
        </div>
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
          <p className="text-xs text-muted-foreground">Gerados no mês</p>
          <p className="text-lg font-semibold tabular-nums">
            {indicators?.generatedThisMonth.toLocaleString("pt-BR") ?? "—"}
          </p>
        </div>
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
          <p className="text-xs text-muted-foreground">Eventos de acesso</p>
          <p className="text-lg font-semibold tabular-nums">
            {indicators?.totalAccessEvents.toLocaleString("pt-BR") ?? "—"}
          </p>
        </div>
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
          <p className="text-xs text-muted-foreground">Período mais antigo</p>
          <p className="text-sm font-medium">
            {formatDateTime(indicators?.oldestAuditAt ?? indicators?.oldestAccessAt ?? null)}
          </p>
        </div>
      </div>

      {indicators?.topEntities?.length ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Top entidades / módulos
          </p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {indicators.topEntities.map((e) => (
              <li
                key={e.entity}
                className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
              >
                {e.entity}: <span className="font-semibold tabular-nums">{e.count}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {alertText ? (
        <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{alertText}</p>
        </div>
      ) : null}

      {policiesQ.isError ? (
        <DataLoadAlert
          messages={[
            policiesQ.error instanceof Error
              ? policiesQ.error.message
              : "Não foi possível carregar as políticas."
          ]}
        />
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-3 font-semibold">Categoria</th>
              <th className="py-2 pr-3 font-semibold">Dias de retenção</th>
              <th className="py-2 pr-3 font-semibold">Mínimo</th>
              <th className="py-2 font-semibold">Descarte ativo</th>
            </tr>
          </thead>
          <tbody>
            {local.map((p) => (
              <tr key={p.id} className="border-b border-border/60">
                <td className="py-2 pr-3">
                  <span className="font-medium text-foreground">{p.label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{p.categoryKey}</span>
                </td>
                <td className="py-2 pr-3">
                  <Input
                    type="number"
                    min={p.minRetentionDays}
                    max={36500}
                    className="h-8 w-28"
                    value={p.retentionDays}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setLocal((prev) =>
                        prev.map((row) =>
                          row.id === p.id
                            ? {
                                ...row,
                                retentionDays: Number.isFinite(n)
                                  ? Math.max(p.minRetentionDays, Math.floor(n))
                                  : row.retentionDays
                              }
                            : row
                        )
                      );
                    }}
                  />
                </td>
                <td className="py-2 pr-3 tabular-nums text-muted-foreground">{p.minRetentionDays}</td>
                <td className="py-2">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={p.active}
                      onCheckedChange={(checked) => {
                        setLocal((prev) =>
                          prev.map((row) =>
                            row.id === p.id ? { ...row, active: checked === true } : row
                          )
                        );
                      }}
                    />
                    {p.active ? "Ativo" : "Desligado"}
                  </label>
                </td>
              </tr>
            ))}
            {local.length === 0 && !policiesQ.isLoading ? (
              <tr>
                <td colSpan={4} className="py-3 text-muted-foreground">
                  Nenhuma política encontrada.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={!dirty || saving} onClick={() => void onSave()}>
          <Save className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          {saving ? "Salvando…" : "Salvar políticas"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busyJob != null}
          onClick={() => void onDryRun()}
        >
          <Play className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          {busyJob === "dry" ? "Simulando…" : "Simular descarte (dry-run)"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={busyJob != null || (indicators != null && !indicators.discardEnabled)}
          onClick={() => setConfirmExec(true)}
        >
          <AlertTriangle className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Executar descarte
        </Button>
      </div>

      {lastDryPreview != null ? (
        <p className="text-xs text-muted-foreground">
          Última simulação: {lastDryPreview.toLocaleString("pt-BR")} registro(s) elegíveis.
        </p>
      ) : null}

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Histórico de execuções
        </p>
        {runsQ.isLoading ? (
          <p className="mt-1 text-sm text-muted-foreground">Carregando…</p>
        ) : (runsQ.data ?? []).length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">Nenhuma execução registrada.</p>
        ) : (
          <ul className="mt-2 space-y-1.5 text-sm">
            {(runsQ.data ?? []).map((run) => (
              <li key={run.id} className="rounded-md border border-border px-2 py-1.5">
                <span className="font-medium">{run.mode}</span> · {run.status} ·{" "}
                {run.mode === "EXECUTE" ? `${run.deletedCount} removido(s)` : `${run.previewCount} elegível(is)`}{" "}
                · {formatDateTime(run.createdAt)}
                {run.errorSummary ? (
                  <span className="mt-0.5 block text-xs text-amber-800">{run.errorSummary}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal open={confirmExec} onClose={() => busyJob !== "exec" && setConfirmExec(false)} title="Confirmar descarte">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Esta ação remove definitivamente logs elegíveis pelas políticas <strong>ativas</strong>, por
            categoria e idade. Não há exclusão seletiva por conteúdo. O conteúdo eliminado{" "}
            <strong>não</strong> é regravado no histórico de execução.
          </p>
          <p className="text-sm text-muted-foreground">
            Recomendado: executar dry-run antes. Logs de notificações, ocorrências e Controladoria são
            preservados.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={busyJob === "exec"}
              onClick={() => setConfirmExec(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busyJob === "exec"}
              onClick={() => void onExecute()}
            >
              {busyJob === "exec" ? "Executando…" : "Confirmar descarte"}
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
