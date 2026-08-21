"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  getContractItemChangeLogs,
  type ContractItemChangeLog
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InlineLoading } from "@/components/ui/inline-loading";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PAGE_SIZES = [10, 25, 50, 100] as const;

const actionLabel: Record<ContractItemChangeLog["action"], string> = {
  CREATED: "Inserido",
  DELETED: "Excluído",
  STATUS_CHANGED: "Status alterado",
  UPDATED: "Alterado",
  BULK_IMPORTED: "Importação em massa"
};

const itemTypeLabel: Record<ContractItemChangeLog["itemType"], string> = {
  MODULE: "Módulo",
  FEATURE: "Funcionalidade",
  SERVICE: "Serviço"
};

const featureStatusLabel: Record<string, string> = {
  NOT_STARTED: "Não iniciada",
  IN_PROGRESS: "Em progresso",
  DELIVERED: "Entregue",
  VALIDATED: "Validada"
};

const deliveryStatusLabel: Record<string, string> = {
  NOT_DELIVERED: "Não entregue",
  PARTIALLY_DELIVERED: "Parcial",
  DELIVERED: "Concluída"
};

const criticalityLabel: Record<string, string> = {
  CRITICA: "Crítica",
  ALTA: "Alta",
  MEDIA: "Média",
  BAIXA: "Baixa",
  APOIO: "Apoio",
  NAO_SE_APLICA: "Não se aplica"
};

type DraftFilters = {
  from: string;
  to: string;
  actor: string;
  itemType: string;
  action: string;
  q: string;
};

const EMPTY_FILTERS: DraftFilters = {
  from: "",
  to: "",
  actor: "",
  itemType: "ALL",
  action: "ALL",
  q: ""
};

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function statusText(value?: string | null, labels: Record<string, string> = {}): string {
  if (!value) return "sem status";
  return labels[value] ?? value;
}

function fieldText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "NULL";
  return String(value);
}

function stringField(record: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!record || !(key in record)) return null;
  return fieldText(record[key]);
}

function ChangeDetails({ log }: { log: ContractItemChangeLog }): JSX.Element | null {
  const statusChanged = log.statusBefore !== log.statusAfter && (log.statusBefore || log.statusAfter);
  const deliveryChanged =
    log.deliveryStatusBefore !== log.deliveryStatusAfter && (log.deliveryStatusBefore || log.deliveryStatusAfter);
  const criticalityChanged =
    log.criticalityBefore !== log.criticalityAfter && (log.criticalityBefore || log.criticalityAfter);
  const oldCode = stringField(log.oldData, "itemCode");
  const newCode = stringField(log.newData, "itemCode");
  const codeChanged = log.itemType === "FEATURE" && oldCode !== newCode && (oldCode !== null || newCode !== null);
  const oldName = stringField(log.oldData, "name");
  const newName = stringField(log.newData, "name");
  const nameChanged = oldName !== newName && (oldName !== null || newName !== null);

  if (!statusChanged && !deliveryChanged && !criticalityChanged && !codeChanged && !nameChanged) return null;

  return (
    <div className="mt-2 space-y-1 text-xs text-slate-600">
      {codeChanged ? (
        <p>
          Código do Item: <strong>{oldCode ?? "NULL"}</strong> → <strong>{newCode ?? "NULL"}</strong>
        </p>
      ) : null}
      {nameChanged ? (
        <p>
          Nome/descrição: <strong>{oldName ?? "NULL"}</strong> → <strong>{newName ?? "NULL"}</strong>
        </p>
      ) : null}
      {statusChanged ? (
        <p>
          Status: <strong>{statusText(log.statusBefore, featureStatusLabel)}</strong> →{" "}
          <strong>{statusText(log.statusAfter, featureStatusLabel)}</strong>
        </p>
      ) : null}
      {criticalityChanged ? (
        <p>
          Criticidade: <strong>{statusText(log.criticalityBefore, criticalityLabel)}</strong> →{" "}
          <strong>{statusText(log.criticalityAfter, criticalityLabel)}</strong>
        </p>
      ) : null}
      {deliveryChanged ? (
        <p>
          Entrega: <strong>{statusText(log.deliveryStatusBefore, deliveryStatusLabel)}</strong> →{" "}
          <strong>{statusText(log.deliveryStatusAfter, deliveryStatusLabel)}</strong>
        </p>
      ) : null}
    </div>
  );
}

export function ContractItemChangeHistoryPanel({
  contractId,
  logs: logsProp
}: {
  contractId?: string;
  /** @deprecated Preferir carga paginada via contractId. */
  logs?: ContractItemChangeLog[];
}): JSX.Element {
  const [draft, setDraft] = useState<DraftFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<DraftFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [gotoPage, setGotoPage] = useState("");

  const filterKey = useMemo(
    () => JSON.stringify({ ...applied, page, pageSize }),
    [applied, page, pageSize]
  );

  const qLogs = useQuery({
    queryKey: queryKeys.contractItemChangeLogs(contractId ?? "none", filterKey),
    queryFn: () =>
      getContractItemChangeLogs(contractId!, {
        page,
        pageSize,
        from: applied.from || undefined,
        to: applied.to || undefined,
        actor: applied.actor.trim() || undefined,
        itemType: applied.itemType !== "ALL" ? applied.itemType : undefined,
        action: applied.action !== "ALL" ? applied.action : undefined,
        q: applied.q.trim() || undefined
      }),
    enabled: Boolean(contractId)
  });

  const pageData = contractId ? qLogs.data : undefined;
  const logs = contractId ? pageData?.items ?? [] : logsProp ?? [];
  const total = pageData?.total ?? logs.length;
  const pageCount = pageData?.pageCount ?? (logs.length > 0 ? 1 : 0);

  function applyFilters(): void {
    setApplied({ ...draft });
    setPage(1);
  }

  function clearFilters(): void {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
  }

  function goToTypedPage(): void {
    const n = Number(gotoPage);
    if (!Number.isFinite(n) || n < 1 || (pageCount > 0 && n > pageCount)) return;
    setPage(Math.trunc(n));
    setGotoPage("");
  }

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Auditoria</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Histórico de alterações dos itens do contrato (módulos, funcionalidades e serviços). Esta área poderá
            consolidar outros eventos do contrato no futuro.
          </p>
        </div>
        <span className="text-xs text-slate-500">
          {qLogs.isFetching ? (
            <InlineLoading label="Carregando..." />
          ) : (
            `${total} registro${total === 1 ? "" : "s"}`
          )}
        </span>
      </div>

      {contractId ? (
        <div className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <label className="space-y-1 text-xs text-slate-600">
              <span>De</span>
              <Input
                type="date"
                value={draft.from}
                onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
              />
            </label>
            <label className="space-y-1 text-xs text-slate-600">
              <span>Até</span>
              <Input
                type="date"
                value={draft.to}
                onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
              />
            </label>
            <label className="space-y-1 text-xs text-slate-600">
              <span>Autor</span>
              <Input
                placeholder="Nome ou e-mail"
                value={draft.actor}
                onChange={(e) => setDraft((d) => ({ ...d, actor: e.target.value }))}
              />
            </label>
            <label className="space-y-1 text-xs text-slate-600">
              <span>Tipo de item</span>
              <Select
                value={draft.itemType}
                onValueChange={(v) => setDraft((d) => ({ ...d, itemType: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  <SelectItem value="MODULE">Módulo</SelectItem>
                  <SelectItem value="FEATURE">Funcionalidade</SelectItem>
                  <SelectItem value="SERVICE">Serviço</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1 text-xs text-slate-600">
              <span>Ação</span>
              <Select value={draft.action} onValueChange={(v) => setDraft((d) => ({ ...d, action: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas</SelectItem>
                  {(Object.keys(actionLabel) as Array<keyof typeof actionLabel>).map((k) => (
                    <SelectItem key={k} value={k}>
                      {actionLabel[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1 text-xs text-slate-600">
              <span>Busca</span>
              <Input
                placeholder="Nome do item, autor…"
                value={draft.q}
                onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyFilters();
                }}
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={applyFilters}>
              Aplicar filtros
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={clearFilters}>
              Limpar
            </Button>
            <div className="ml-auto flex items-center gap-2 text-xs text-slate-600">
              <span>Por página</span>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v));
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-[88px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      ) : null}

      {qLogs.isLoading && contractId ? (
        <p className="mt-4 text-sm text-slate-600">
          <InlineLoading label="Carregando auditoria..." />
        </p>
      ) : logs.length === 0 ? (
        <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Nenhuma alteração de item registrada ainda
          {contractId && (applied.q || applied.from || applied.to || applied.actor || applied.itemType !== "ALL" || applied.action !== "ALL")
            ? " com os filtros atuais."
            : ". O histórico passa a ser preenchido a partir desta versão."}
        </p>
      ) : (
        <>
          <ul className="mt-4 space-y-3">
            {logs.map((log) => (
              <li key={log.id} className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                        {actionLabel[log.action] ?? log.action}
                      </span>
                      <span className="text-xs text-slate-500">{itemTypeLabel[log.itemType] ?? log.itemType}</span>
                    </div>
                    <p className="mt-2 text-sm font-normal leading-relaxed text-slate-800">{log.itemName}</p>
                  </div>
                  <span className="text-xs text-slate-500">{formatDateTime(log.changedAt)}</span>
                </div>
                <ChangeDetails log={log} />
                <p className="mt-2 text-xs text-slate-500">Alterado por: {log.actorLabel || "system"}</p>
              </li>
            ))}
          </ul>

          {contractId && pageCount > 0 ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-sm text-slate-600">
              <p>
                Página {page} de {pageCount || 1}
              </p>
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage(1)}
                >
                  1ª
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pageCount === 0 || page >= pageCount}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pageCount === 0 || page >= pageCount}
                  onClick={() => setPage(pageCount)}
                >
                  Última
                </Button>
                <div className="ml-2 flex items-center gap-1">
                  <Input
                    className="h-8 w-16"
                    inputMode="numeric"
                    placeholder="Nº"
                    value={gotoPage}
                    onChange={(e) => setGotoPage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") goToTypedPage();
                    }}
                  />
                  <Button type="button" size="sm" variant="outline" onClick={goToTypedPage}>
                    Ir
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}
