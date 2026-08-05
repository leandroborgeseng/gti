"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, Eye, ScrollText } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { AuditLogListItem, AuditLogListParams, AuditLogSource } from "@/lib/api";
import { fetchAuditLogsCsvBlob, getAuditLogDetail, getAuditLogs } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { AuditEventConfigPanel } from "@/components/admin/audit-event-config-panel";
import { Button } from "@/components/ui/button";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type DraftFilters = {
  from: string;
  to: string;
  actor: string;
  action: string;
  entity: string;
  q: string;
  source: "ALL" | AuditLogSource;
};

const EMPTY_FILTERS: DraftFilters = {
  from: "",
  to: "",
  actor: "",
  action: "",
  entity: "",
  q: "",
  source: "ALL"
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function sourceLabel(source: AuditLogSource): string {
  return source === "AUDIT" ? "Auditoria" : "Acesso";
}

function prettyJson(value: unknown): string {
  if (value == null) return "-";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function toListParams(filters: DraftFilters, page: number, limit: number): AuditLogListParams {
  return {
    page,
    limit,
    from: filters.from || undefined,
    to: filters.to || undefined,
    actor: filters.actor.trim() || undefined,
    action: filters.action.trim() || undefined,
    entity: filters.entity.trim() || undefined,
    q: filters.q.trim() || undefined,
    source: filters.source
  };
}

export function AuditLogsAdminPanel(): JSX.Element {
  const [draft, setDraft] = useState<DraftFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<DraftFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [detailId, setDetailId] = useState<{ id: string; source: AuditLogSource } | null>(null);
  const [exporting, setExporting] = useState(false);

  const filterKey = useMemo(
    () =>
      JSON.stringify({
        ...applied,
        page,
        limit
      }),
    [applied, page, limit]
  );

  const listQuery = useQuery({
    queryKey: queryKeys.auditLogs(filterKey),
    queryFn: () => getAuditLogs(toListParams(applied, page, limit))
  });

  const detailQuery = useQuery({
    queryKey: ["gestao", "admin", "audit-log-detail", detailId?.id, detailId?.source],
    queryFn: () => getAuditLogDetail(detailId!.id, detailId!.source),
    enabled: Boolean(detailId)
  });

  const loadError = listQuery.error instanceof Error ? listQuery.error.message : listQuery.error ? String(listQuery.error) : null;
  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = listQuery.data?.totalPages ?? 0;

  function applyFilters(): void {
    setApplied({ ...draft });
    setPage(1);
  }

  function clearFilters(): void {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
  }

  async function exportCsv(): Promise<void> {
    setExporting(true);
    try {
      const blob = await fetchAuditLogsCsvBlob(toListParams(applied, 1, 10_000));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `auditoria-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV exportado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao exportar CSV");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <AuditEventConfigPanel />

      <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <ScrollText className="mt-0.5 h-7 w-7 shrink-0 text-primary" aria-hidden />
          <div>
            <h2 className="text-lg font-semibold text-foreground">Consulta de logs</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Consulta central dos registros de alteração (AuditLog) e dos eventos essenciais de autenticação
              (login e logout). Os logs não podem ser editados nem excluídos por esta tela.
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" className="gap-2 shrink-0" disabled={exporting} onClick={() => void exportCsv()}>
          <Download className="h-4 w-4" />
          {exporting ? "Exportando…" : "Exportar CSV"}
        </Button>
      </div>

      {loadError ? <DataLoadAlert messages={[loadError]} title="Não foi possível carregar a auditoria" /> : null}

      <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">De</span>
            <Input
              type="date"
              value={draft.from}
              onChange={(e) => setDraft((prev) => ({ ...prev, from: e.target.value }))}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Até</span>
            <Input type="date" value={draft.to} onChange={(e) => setDraft((prev) => ({ ...prev, to: e.target.value }))} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Usuário / ator</span>
            <Input
              value={draft.actor}
              onChange={(e) => setDraft((prev) => ({ ...prev, actor: e.target.value }))}
              placeholder="E-mail, nome ou system"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Ação</span>
            <Input
              value={draft.action}
              onChange={(e) => setDraft((prev) => ({ ...prev, action: e.target.value }))}
              placeholder="CREATE, UPDATE, LOGIN…"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Entidade / módulo</span>
            <Input
              value={draft.entity}
              onChange={(e) => setDraft((prev) => ({ ...prev, entity: e.target.value }))}
              placeholder="Contract, Auth, Goal…"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Texto na descrição</span>
            <Input
              value={draft.q}
              onChange={(e) => setDraft((prev) => ({ ...prev, q: e.target.value }))}
              placeholder="Trecho de ação, entidade ou e-mail"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Origem</span>
            <Select
              value={draft.source}
              onValueChange={(value) => setDraft((prev) => ({ ...prev, source: value as DraftFilters["source"] }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Origem" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas</SelectItem>
                <SelectItem value="AUDIT">Auditoria</SelectItem>
                <SelectItem value="ACCESS">Acesso (login/logout)</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Por página</span>
            <Select
              value={String(limit)}
              onValueChange={(value) => {
                setLimit(Number(value));
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={applyFilters}>
            Aplicar filtros
          </Button>
          <Button type="button" variant="outline" onClick={clearFilters}>
            Limpar
          </Button>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data/hora</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Entidade</TableHead>
                <TableHead>Ator</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    Carregando logs…
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum registro encontrado para os filtros atuais.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((row) => (
                  <TableRow key={`${row.source}-${row.id}`}>
                    <TableCell className="whitespace-nowrap text-xs">{formatDateTime(row.occurredAt)}</TableCell>
                    <TableCell>
                      <span
                        className={
                          row.source === "AUDIT"
                            ? "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800"
                            : "rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-900"
                        }
                      >
                        {sourceLabel(row.source)}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.action}</TableCell>
                    <TableCell className="text-xs">
                      <div>{row.entity}</div>
                      {row.entityId ? (
                        <div className="max-w-[10rem] truncate text-muted-foreground" title={row.entityId}>
                          {row.entityId}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-[12rem] truncate text-xs" title={row.actorLabel}>
                      {row.actorLabel}
                    </TableCell>
                    <TableCell className="max-w-[16rem] truncate text-xs" title={row.description}>
                      {row.description}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {row.originHref ? (
                          <Button asChild variant="ghost" size="sm">
                            <Link href={row.originHref}>Contrato</Link>
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          onClick={() => setDetailId({ id: row.id, source: row.source })}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Detalhe
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-col gap-2 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {total === 0
              ? "0 registros"
              : `Página ${page} de ${totalPages} · ${total.toLocaleString("pt-BR")} registro(s)`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1 || listQuery.isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={totalPages === 0 || page >= totalPages || listQuery.isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      <Modal
        open={Boolean(detailId)}
        onClose={() => setDetailId(null)}
        title="Detalhe do log"
        description="Registro somente leitura. Antes e depois aparecem quando a operação gravou diferença."
        contentClassName="max-w-3xl"
      >
        {detailQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando detalhe…</p>
        ) : detailQuery.error ? (
          <DataLoadAlert
            messages={[detailQuery.error instanceof Error ? detailQuery.error.message : String(detailQuery.error)]}
            title="Não foi possível abrir o detalhe"
          />
        ) : detailQuery.data ? (
          <AuditLogDetailBody item={detailQuery.data} />
        ) : null}
      </Modal>
      </div>
    </div>
  );
}

function AuditLogDetailBody({ item }: { item: AuditLogListItem }): JSX.Element {
  return (
    <div className="space-y-4 text-sm">
      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Data/hora</dt>
          <dd>{formatDateTime(item.occurredAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Tipo</dt>
          <dd>{sourceLabel(item.source)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Ação</dt>
          <dd className="font-mono text-xs">{item.action}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Entidade</dt>
          <dd>
            {item.entity}
            {item.entityId ? <span className="block font-mono text-xs text-muted-foreground">{item.entityId}</span> : null}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs text-muted-foreground">Ator</dt>
          <dd>{item.actorLabel}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs text-muted-foreground">Descrição</dt>
          <dd>{item.description}</dd>
        </div>
        {item.originHref ? (
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Origem</dt>
            <dd>
              <Link href={item.originHref} className="text-primary underline-offset-2 hover:underline">
                Abrir contrato
              </Link>
            </dd>
          </div>
        ) : null}
      </dl>

      {item.source === "AUDIT" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Antes (oldData)</p>
            <pre className="max-h-64 overflow-auto rounded-md border bg-muted/40 p-3 text-xs whitespace-pre-wrap">
              {prettyJson(item.oldData)}
            </pre>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Depois (newData)</p>
            <pre className="max-h-64 overflow-auto rounded-md border bg-muted/40 p-3 text-xs whitespace-pre-wrap">
              {prettyJson(item.newData)}
            </pre>
          </div>
        </div>
      ) : null}

      {item.source === "ACCESS" && item.metadata != null ? (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Metadados do acesso</p>
          <pre className="max-h-64 overflow-auto rounded-md border bg-muted/40 p-3 text-xs whitespace-pre-wrap">
            {prettyJson(item.metadata)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
