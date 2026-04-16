"use client";

import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KanbanBoardPayload, KanbanCardDto } from "@/glpi/kanban-load";
import { pendenciaLabelForSummary } from "@/glpi/utils/kanban-filters";
import type { HistoryTimelineItemDto, TicketHistoryBundleDto } from "@/glpi/services/glpi-ticket-history.service";
import { AgingOpenDashboard } from "./aging-open-dashboard";

type TicketDetail = {
  glpiTicketId: number;
  name: string;
  content: string;
  statusLabel: string | null;
  priorityLabel: string | null;
  statusId: number | null;
  priorityId: number | null;
  dateCreation: string | null;
  dateModification: string | null;
  contractGroupName: string | null;
  requesterName: string;
  requesterEmail: string;
  observers: Array<{ userId: number | null; displayName: string | null; email: string | null }>;
  context: { groups: string[]; assignees: string[]; category: string | null; entity: string | null };
  statusOptions: Array<{ id: number; label: string }>;
  priorityOptions: Array<{ id: number; label: string }>;
  history?: TicketHistoryBundleDto | null;
};

function moveBefore(order: string[], dragged: string, target: string): string[] {
  if (dragged === target) return order;
  const without = order.filter((k) => k !== dragged);
  const idx = without.indexOf(target);
  if (idx < 0) return order;
  without.splice(idx, 0, dragged);
  return without;
}

function KanbanSyncIcon({ syncStale }: { syncStale: boolean }): JSX.Element {
  if (syncStale) {
    return (
      <svg className="card-sync-flag__svg" viewBox="0 0 20 20" fill="none" aria-hidden>
        <circle cx="10" cy="10" r="9" fill="#d97706" />
        <path d="M10 5.5V11M10 14.5h.01" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg className="card-sync-flag__svg" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="9" fill="#16a34a" />
      <path d="M6 10.2l2.4 2.2L14.2 7" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function proxyGlpiAssetsInHtml(html: string): string {
  if (typeof window === "undefined") return html;
  try {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
    const root = doc.body.firstElementChild;
    if (!root) return html;
    root.querySelectorAll("img[src], a[href]").forEach((el) => {
      const tag = el.tagName.toLowerCase();
      const attr = tag === "img" ? "src" : "href";
      const raw = el.getAttribute(attr);
      if (!raw) return;
      if (raw.startsWith("data:") || raw.startsWith("blob:") || raw.startsWith("#")) return;
      el.setAttribute(attr, `/api/glpi-asset?url=${encodeURIComponent(raw)}`);
      if (tag === "a") {
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
      }
    });
    return root.innerHTML;
  } catch {
    return html;
  }
}

function pendBadgeClass(pend: string): string {
  if (pend === "cliente" || pend === "empresa" || pend === "na" || pend === "unknown") {
    return `pend-badge pend-badge--${pend}`;
  }
  return "pend-badge pend-badge--none";
}

function parseInlineStyle(css: string): CSSProperties {
  const style: Record<string, string> = {};
  for (const part of css.split(";")) {
    const idx = part.indexOf(":");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!key || !val) continue;
    const reactKey = key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    (style as Record<string, string>)[reactKey] = val;
  }
  return style as CSSProperties;
}

function cssVarsToStyle(css: string): CSSProperties {
  const style: Record<string, string> = {};
  for (const part of css.split(";")) {
    const idx = part.indexOf(":");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key.startsWith("--") && val) {
      style[key] = val;
    }
  }
  return style as CSSProperties;
}

export function ChamadosBoard({ initial }: { initial: KanbanBoardPayload }): JSX.Element {
  const router = useRouter();
  const fsRootRef = useRef<HTMLDivElement>(null);
  const [columnOrder, setColumnOrder] = useState<string[]>(() => [...initial.orderedStatusKeys]);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [fsPressed, setFsPressed] = useState(false);
  const [modalId, setModalId] = useState<number | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editStatusId, setEditStatusId] = useState<string>("");
  const [editPriorityId, setEditPriorityId] = useState<string>("");
  const [followupText, setFollowupText] = useState("");
  const [followupPrivate, setFollowupPrivate] = useState(false);
  const [syncScopeDraft, setSyncScopeDraft] = useState<"open" | "all">(initial.ticketSyncScope);

  const colByKey = useMemo(() => new Map(initial.columns.map((c) => [c.statusKey, c])), [initial.columns]);

  const orderedColumns = useMemo(
    () => columnOrder.map((k) => colByKey.get(k)).filter((c): c is NonNullable<typeof c> => Boolean(c)),
    [columnOrder, colByKey]
  );

  const persistColumnOrder = useCallback(async (next: string[]) => {
    setBusy("colunas");
    try {
      const res = await fetch("/api/kanban", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columnOrder: next })
      });
      if (!res.ok) throw new Error("Falha ao guardar ordem das colunas");
      setToast("Ordem das colunas guardada.");
      setTimeout(() => setToast(null), 2500);
    } catch {
      setToast("Não foi possível guardar a ordem das colunas.");
      setTimeout(() => setToast(null), 3500);
    } finally {
      setBusy(null);
    }
  }, []);

  const onDropOnColumn = useCallback(
    (targetKey: string) => {
      if (!dragKey) return;
      const next = moveBefore(columnOrder, dragKey, targetKey);
      setColumnOrder(next);
      setDragKey(null);
      void persistColumnOrder(next);
    },
    [columnOrder, dragKey, persistColumnOrder]
  );

  const openModal = useCallback(async (glpiId: number) => {
    setModalId(glpiId);
    setDetail(null);
    setDetailErr(null);
    setFollowupText("");
    setFollowupPrivate(false);
    try {
      const res = await fetch(`/api/tickets/glpi/${glpiId}`);
      const data = (await res.json()) as TicketDetail & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Falha ao carregar chamado");
      }
      setDetail(data);
      setEditName(data.name || "");
      setEditContent(data.content || "");
      setEditStatusId(data.statusId != null ? String(data.statusId) : "");
      setEditPriorityId(data.priorityId != null ? String(data.priorityId) : "");
    } catch (e) {
      setDetailErr(e instanceof Error ? e.message : "Erro ao carregar");
    }
  }, []);

  const closeModal = useCallback(() => {
    setModalId(null);
    setDetail(null);
    setDetailErr(null);
  }, []);

  useEffect(() => {
    if (!modalId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalId, closeModal]);

  const saveTicket = useCallback(async () => {
    if (!modalId) return;
    setBusy("salvar");
    setDetailErr(null);
    try {
      const res = await fetch(`/api/tickets/glpi/${modalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          content: editContent,
          statusId: editStatusId === "" ? null : Number(editStatusId),
          priorityId: editPriorityId === "" ? null : Number(editPriorityId)
        })
      });
      const data = (await res.json().catch(() => null)) as { error?: string; detail?: string } | null;
      if (!res.ok) {
        throw new Error((data && (data.detail || data.error)) || "Falha ao salvar");
      }
      closeModal();
      router.refresh();
    } catch (e) {
      setDetailErr(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setBusy(null);
    }
  }, [modalId, editName, editContent, editStatusId, editPriorityId, closeModal, router]);

  const sendFollowup = useCallback(async () => {
    if (!modalId) return;
    const msg = followupText.trim();
    if (!msg) {
      setDetailErr("Escreva uma mensagem para publicar no histórico.");
      return;
    }
    setBusy("followup");
    setDetailErr(null);
    try {
      const res = await fetch(`/api/tickets/glpi/${modalId}/followup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: msg, isPrivate: followupPrivate })
      });
      const data = (await res.json().catch(() => null)) as { error?: string; detail?: string } | null;
      if (!res.ok) {
        throw new Error((data && (data.detail || data.error)) || "Falha ao publicar");
      }
      setFollowupText("");
      setFollowupPrivate(false);
      await openModal(modalId);
    } catch (e) {
      setDetailErr(e instanceof Error ? e.message : "Erro ao publicar");
    } finally {
      setBusy(null);
    }
  }, [modalId, followupText, followupPrivate, openModal]);

  const saveSyncScope = useCallback(async (scope: "open" | "all") => {
    setBusy("escopo");
    try {
      const res = await fetch("/api/settings/sync-scope", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope })
      });
      if (!res.ok) throw new Error("Falha ao guardar escopo");
      setToast("Escopo de sincronização guardado.");
      setTimeout(() => setToast(null), 2500);
      router.refresh();
    } catch {
      setToast("Não foi possível guardar o escopo.");
      setTimeout(() => setToast(null), 3500);
    } finally {
      setBusy(null);
    }
  }, [router]);

  const recalcPendencia = useCallback(async () => {
    setBusy("pendencia");
    try {
      const res = await fetch("/api/tickets/recalc-pendencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: initial.q,
          status: initial.statusFilter,
          group: initial.groupFilter,
          open: initial.onlyOpen,
          pendencia: initial.pendenciaParam
        })
      });
      const data = (await res.json()) as { error?: string; updated?: number };
      if (!res.ok) throw new Error(data.error || "Falha");
      setToast(`Pendência recalculada (${data.updated ?? 0} chamados).`);
      setTimeout(() => setToast(null), 3500);
      router.refresh();
    } catch {
      setToast("Falha ao recalcular pendência.");
      setTimeout(() => setToast(null), 3500);
    } finally {
      setBusy(null);
    }
  }, [initial, router]);

  const toggleFullscreen = useCallback(() => {
    const el = fsRootRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      void el.requestFullscreen().then(() => setFsPressed(true));
    } else {
      void document.exitFullscreen().then(() => setFsPressed(false));
    }
  }, []);

  useEffect(() => {
    const onFs = () => {
      setFsPressed(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const filterPills = useMemo(() => {
    const openLabel = initial.onlyOpen ? "Sim" : "Não";
    const pill = (k: string, v: string, muted: boolean) => (
      <span key={k} className={`filter-pill${muted ? " filter-pill--muted" : ""}`}>
        <span className="filter-pill__k">{k}</span>
        <span className="filter-pill__v">{v}</span>
      </span>
    );
    return [
      pill("Busca", initial.q || "—", !initial.q),
      pill("Status", initial.statusFilter || "Todos", !initial.statusFilter),
      pill("Grupo", initial.groupFilter || "Todos", !initial.groupFilter),
      pill("Abertos", openLabel, !initial.onlyOpen),
      pill("Pendência", pendenciaLabelForSummary(initial.pendenciaParam), initial.pendenciaParam === ""),
      pill(
        "Sync cache",
        initial.ticketSyncScope === "all" ? "Todos os tickets" : "Só abertos",
        initial.ticketSyncScope === "open"
      )
    ];
  }, [initial]);

  const historyHtmlByItem = useMemo(() => {
    const items = detail?.history?.items;
    if (!items?.length) return new Map<number, string>();
    const m = new Map<number, string>();
    items.forEach((item: HistoryTimelineItemDto, i: number) => {
      m.set(i, proxyGlpiAssetsInHtml(item.contentHtml || ""));
    });
    return m;
  }, [detail?.history?.items]);

  return (
    <>
      {toast ? (
        <p className="chamados-glpi-toast" role="status">
          {toast}
        </p>
      ) : null}

      <AgingOpenDashboard buckets={initial.ageBuckets} />

      <div className="kanban-filters-stack">
        <div className="filters-shell">
          <header className="filters-shell__head">
            <h2 className="filters-shell__title">Filtros do Kanban</h2>
            <p className="filters-shell__lede">
              Aplicam ao quadro, ao painel de idade dos abertos e ao recálculo de pendência (até 200 cards por coluna)
            </p>
          </header>
          <div className="filters-shell__pills" aria-label="Filtros aplicados">
            {filterPills}
          </div>
          <form id="kanban-filters-form" className="filters-grid" method="get" action="/chamados">
            <label>
              Busca
              <input type="text" name="q" defaultValue={initial.q} placeholder="ID, título ou conteúdo" autoComplete="off" />
            </label>
            <label>
              Status
              <select name="status" defaultValue={initial.statusFilter}>
                <option value="">Todos</option>
                {initial.statuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Grupo
              <select name="group" defaultValue={initial.groupFilter}>
                <option value="">Todos</option>
                {initial.groups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Pendência
              <select name="pendencia" defaultValue={initial.pendenciaParam} title="Inferência no cache">
                <option value="">Todas</option>
                <option value="cliente">Cliente</option>
                <option value="empresa">Empresa</option>
                <option value="desconhecido">Indefinido</option>
                <option value="na">Encerrado</option>
              </select>
            </label>
            <label>
              Só abertos
              <select name="open" defaultValue={initial.onlyOpen ? "1" : "0"}>
                <option value="0">Não</option>
                <option value="1">Sim</option>
              </select>
            </label>
          </form>
          <footer className="filters-shell__sync">
            <div className="filters-shell__sync-row">
              <span className="filters-shell__sync-h">Cache</span>
              <select
                id="sync-scope-select"
                className="filters-shell__sync-select"
                aria-label="Escopo de sincronizacao no cache"
                title="Próximo ciclo do cron"
                value={syncScopeDraft}
                disabled={Boolean(busy)}
                onChange={(e) => setSyncScopeDraft(e.target.value === "all" ? "all" : "open")}
              >
                <option value="open">Só abertos no SQLite</option>
                <option value="all">Todos (abertos + fechados)</option>
              </select>
              <button type="submit" form="kanban-filters-form" className="btn-secondary" id="btn-filters-apply">
                Aplicar
              </button>
              <button
                type="button"
                className="btn-secondary"
                id="btn-save-sync-scope"
                disabled={Boolean(busy)}
                onClick={() => void saveSyncScope(syncScopeDraft)}
              >
                Guardar escopo
              </button>
              <button
                type="button"
                className="btn-secondary"
                id="btn-recalc-pendencia"
                title="Até 200 tickets com os filtros atuais"
                disabled={Boolean(busy)}
                onClick={() => void recalcPendencia()}
              >
                Recalcular pendência
              </button>
            </div>
            {busy ? (
              <p className="filters-shell__sync-msg" role="status" aria-live="polite">
                {busy === "colunas" ? "A guardar ordem das colunas…" : "A processar…"}
              </p>
            ) : null}
          </footer>
        </div>
      </div>

      <div className="kanban-fs-root" id="kanban-fullscreen-root" ref={fsRootRef}>
        <div className="section-head section-head--kanban">
          <div>
            <h2 className="section-title">Kanban por status</h2>
            <p className="section-tools">
              Arraste pelo <strong>cabeçalho azul</strong> da coluna para reordenar. Clique no card para abrir o painel
              de edição e histórico.
            </p>
          </div>
          <button
            type="button"
            className="btn-fs"
            id="kanban-fs-toggle"
            aria-pressed={fsPressed}
            title="Maximizar o quadro para reuniao ou TV"
            onClick={() => void toggleFullscreen()}
          >
            Tela inteira
          </button>
        </div>
        <p className="kanban-legend" role="note">
          <span className="legend-swatch legend-swatch--fresh" aria-hidden />
          <span>Recente (verde)</span>
          <span className="legend-arrow" aria-hidden>
            →
          </span>
          <span className="legend-swatch legend-swatch--stale" aria-hidden />
          <span>Aberto há mais tempo (vermelho, até ~90 dias)</span>
        </p>
        <div className="kanban-board" id="kanban-board">
          {orderedColumns.length === 0 ? (
            <div className="small">(nenhum ticket sincronizado ainda)</div>
          ) : (
            orderedColumns.map((col) => (
              <div
                key={col.statusKey}
                className={`kanban-column${dragKey === col.statusKey ? " dragging" : ""}`}
                data-status={col.statusKey}
                style={cssVarsToStyle(col.columnStyle)}
                onDragOver={(e) => {
                  e.preventDefault();
                }}
                onDrop={() => {
                  onDropOnColumn(col.statusKey);
                }}
              >
                <div
                  className="kanban-column-handle"
                  draggable
                  onDragStart={() => {
                    setDragKey(col.statusKey);
                  }}
                  onDragEnd={() => {
                    setDragKey(null);
                  }}
                >
                  <h3>
                    {col.statusKey} <span className="small">({col.count})</span>
                  </h3>
                </div>
                <div className="kanban-column-body">
                  {col.cards.length === 0 ? (
                    <div className="small">(sem chamados)</div>
                  ) : (
                    col.cards.map((card: KanbanCardDto) => (
                      <div
                        key={card.glpiTicketId}
                        className="kanban-card"
                        role="button"
                        tabIndex={0}
                        draggable={false}
                        data-glpi-id={card.glpiTicketId}
                        data-waiting={card.pendClass}
                        style={parseInlineStyle(card.cardStyle)}
                        onClick={() => void openModal(card.glpiTicketId)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            void openModal(card.glpiTicketId);
                          }
                        }}
                      >
                        <div className="kanban-card__head">
                          <div className="card-id">#{card.glpiTicketId}</div>
                          <div className="kanban-card__actions">
                            <span
                              className={`card-sync-flag${card.syncStale ? " card-sync-flag--stale" : ""}`}
                              title={card.syncTip}
                              aria-label={card.syncTip}
                              role="img"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <KanbanSyncIcon syncStale={card.syncStale} />
                            </span>
                            <button
                              type="button"
                              className="card-details-btn"
                              title="Abrir detalhes do chamado"
                              aria-label={`Abrir detalhes do chamado #${card.glpiTicketId}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                void openModal(card.glpiTicketId);
                              }}
                            >
                              i
                            </button>
                          </div>
                        </div>
                        <div className="card-title">{card.title || "(sem título)"}</div>
                        <span className={pendBadgeClass(card.pendClass)}>{card.pendLabel}</span>
                        <div className="card-meta">Grupo: {card.contractGroupName || "—"}</div>
                        <div className="card-meta">
                          Solicitante: <strong>{card.requesterName}</strong>
                          {card.requesterEmail ? (
                            <>
                              {" "}
                              · <span className="card-meta--fine">{card.requesterEmail}</span>
                            </>
                          ) : null}
                        </div>
                        <div className="card-meta">
                          Aberto há <strong>{card.openFor}</strong> · Sem interação <strong>{card.idleFor}</strong>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))
          )}
        </div>
        {initial.pendenciaParam && initial.filteredTotal === 0 ? (
          <p className="page-lead muted" style={{ marginTop: "1rem", padding: "1rem", background: "rgba(255,255,255,.85)", borderRadius: 12, border: "1px solid #e2e8f0" }}>
            Nenhum chamado com esta pendência no cache. Abra chamados no modal (carrega o histórico GLPI) ou aguarde o
            enriquecimento após a sincronização.
          </p>
        ) : null}

        {modalId ? (
        <div className="modal open" role="dialog" aria-modal aria-labelledby="ticket-modal-title">
          <div className="modal-backdrop" role="presentation" onClick={closeModal} />
          <div className="modal-panel">
            <div className="modal-header">
              <h2 id="ticket-modal-title">Editar chamado #{modalId}</h2>
              <button type="button" className="modal-close" onClick={closeModal} aria-label="Fechar">
                ✕
              </button>
            </div>
            {detailErr ? <p className="modal-error" style={{ padding: "0 1.35rem", marginTop: "0.75rem" }}>{detailErr}</p> : null}
            {!detail && !detailErr ? (
              <p className="modal-hint" style={{ padding: "1.35rem" }}>
                A carregar…
              </p>
            ) : null}
            {detail ? (
              <form
                id="ticket-edit-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveTicket();
                }}
              >
                <label className="modal-field">
                  Título
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                </label>
                <div className="modal-grid">
                  <label className="modal-field">
                    Estado (GLPI)
                    <select value={editStatusId} onChange={(e) => setEditStatusId(e.target.value)}>
                      <option value="">(sem alteração)</option>
                      {detail.statusOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="modal-field">
                    Prioridade
                    <select value={editPriorityId} onChange={(e) => setEditPriorityId(e.target.value)}>
                      <option value="">(sem alteração)</option>
                      {detail.priorityOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="modal-field">
                  Descrição (HTML do GLPI — edite com cuidado)
                  <textarea rows={10} value={editContent} onChange={(e) => setEditContent(e.target.value)} />
                </label>
                <p className="modal-hint">
                  <strong>Solicitante:</strong> {detail.requesterName}{" "}
                  {detail.requesterEmail ? `· ${detail.requesterEmail}` : ""}
                </p>
                <p className="modal-hint">
                  <strong>Grupo / entidade:</strong> {(detail.context.groups || []).join(", ") || "—"} ·{" "}
                  {detail.context.entity || "—"}
                </p>
                <div className="modal-actions">
                  <button type="button" className="btn-secondary" onClick={closeModal}>
                    Cancelar
                  </button>
                  <button type="submit" id="ticket-edit-submit" disabled={Boolean(busy)}>
                    Guardar alterações no GLPI
                  </button>
                </div>

                {detail.history ? (
                  <div id="ticket-history-section">
                    {detail.history.historyError ? (
                      <p id="ticket-history-api-error">Aviso ao carregar historico GLPI: {detail.history.historyError}</p>
                    ) : null}
                    <div className={`waiting-banner waiting-${detail.history.waitingOn}`}>
                      {detail.history.waitingLabel ? <strong>{detail.history.waitingLabel}</strong> : null}
                      {detail.history.waitingDetail ? (
                        <span className="small" style={{ display: "block", marginTop: "0.35rem" }}>
                          {detail.history.waitingDetail}
                        </span>
                      ) : null}
                    </div>
                    <h3 className="history-heading">Histórico</h3>
                    <p className="history-help">Linha do tempo carregada do GLPI (imagens passam pelo proxy local).</p>
                    <div className="history-list" id="ticket-history-list">
                      {(detail.history.items || []).map((item: HistoryTimelineItemDto, i: number) => {
                        const metaLine = `${item.title || item.kind || ""} · ${item.date || "—"} · ${
                          item.authorLabel || (item.usersId ? `User #${item.usersId}` : "Autor nao identificado")
                        }${item.isPrivate ? " [Privado]" : ""}`;
                        const html = historyHtmlByItem.get(i) ?? "";
                        return (
                          <article key={`${item.date}-${i}`} className="history-item">
                            <div className="history-meta">{metaLine}</div>
                            <div className="history-body ql-snow">
                              <div className="ql-editor" dangerouslySetInnerHTML={{ __html: html }} />
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="ticket-followup-composer">
                  <label className="modal-field">
                    Novo acompanhamento
                    <textarea
                      rows={4}
                      placeholder="Mensagem a publicar no histórico do GLPI"
                      value={followupText}
                      onChange={(e) => setFollowupText(e.target.value)}
                    />
                  </label>
                  <label className="ticket-followup-private">
                    <input type="checkbox" checked={followupPrivate} onChange={(e) => setFollowupPrivate(e.target.checked)} />
                    Privado (equipe)
                  </label>
                  <div className="ticket-followup-actions">
                    <button type="button" className="btn-secondary" disabled={Boolean(busy)} onClick={() => void sendFollowup()}>
                      Publicar acompanhamento
                    </button>
                  </div>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
      </div>
    </>
  );
}
