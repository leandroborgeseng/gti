"use client";

import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import type { KanbanBoardPayload, KanbanCardDto } from "@/glpi/kanban-load";
import { sumOpenAgeBuckets } from "@/glpi/utils/open-ticket-aging";

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
  history: unknown;
};

/** Coloca `dragged` imediatamente antes de `target` na ordem das colunas. */
function moveBefore(order: string[], dragged: string, target: string): string[] {
  if (dragged === target) return order;
  const without = order.filter((k) => k !== dragged);
  const idx = without.indexOf(target);
  if (idx < 0) return order;
  without.splice(idx, 0, dragged);
  return without;
}

export function ChamadosBoard({ initial }: { initial: KanbanBoardPayload }): JSX.Element {
  const router = useRouter();
  const [columnOrder, setColumnOrder] = useState<string[]>(() => [...initial.orderedStatusKeys]);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
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

  const ageTotal = sumOpenAgeBuckets(initial.ageBuckets);

  return (
    <div className="space-y-6">
      {toast ? (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm">{toast}</div>
      ) : null}

      <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Filtros</h2>
        <p className="mt-1 text-sm text-slate-600">
          {initial.filteredTotal} chamado(s) com os filtros atuais · {initial.pendenciaSummary}
        </p>
        <form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" action="/chamados" method="get">
          <label className="block text-xs font-medium text-slate-600">
            Pesquisa
            <input
              name="q"
              defaultValue={initial.q}
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              placeholder="Título, conteúdo ou ID"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Estado
            <select name="status" defaultValue={initial.statusFilter} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm">
              <option value="">(todos)</option>
              {initial.statuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Grupo contrato
            <select name="group" defaultValue={initial.groupFilter} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm">
              <option value="">(todos)</option>
              {initial.groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Pendência inferida
            <select name="pendencia" defaultValue={initial.pendenciaParam} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm">
              <option value="">(todas)</option>
              <option value="cliente">Aguardando cliente</option>
              <option value="empresa">Aguardando empresa</option>
              <option value="na">Sem pendência / encerrado</option>
              <option value="desconhecido">Indefinida</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
            <input type="checkbox" name="open" value="1" defaultChecked={initial.onlyOpen} />
            Mostrar apenas chamados não fechados
          </label>
          <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-4">
            <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
              Aplicar filtros
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Sincronização com o GLPI</h2>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-slate-600">
              Próximo ciclo do cron
              <select
                className="ml-2 rounded-md border border-slate-200 px-2 py-1 text-sm"
                value={syncScopeDraft}
                disabled={Boolean(busy)}
                onChange={(e) => setSyncScopeDraft(e.target.value === "all" ? "all" : "open")}
              >
                <option value="open">Apenas abertos no cache</option>
                <option value="all">Todos (abertos e fechados)</option>
              </select>
            </label>
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-50"
              disabled={Boolean(busy)}
              onClick={() => void saveSyncScope(syncScopeDraft)}
            >
              Guardar escopo
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-50"
              disabled={Boolean(busy)}
              onClick={() => void recalcPendencia()}
            >
              Recalcular pendência (até 200)
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Arraste o título de uma coluna sobre outra para alterar a ordem (guarda automaticamente no servidor).
          {busy === "colunas" ? " A guardar…" : ""}
        </p>
      </section>

      <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Idade dos chamados abertos (filtro atual)</h2>
        <p className="mt-1 text-sm text-slate-600">
          Total abertos: <strong>{ageTotal}</strong>
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6 text-sm">
          <div className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-900">Esta semana: {initial.ageBuckets.week}</div>
          <div className="rounded-md bg-teal-50 px-3 py-2 text-teal-900">8–15 dias: {initial.ageBuckets.days15}</div>
          <div className="rounded-md bg-amber-50 px-3 py-2 text-amber-900">16–30 dias: {initial.ageBuckets.days30}</div>
          <div className="rounded-md bg-orange-50 px-3 py-2 text-orange-900">31–60 dias: {initial.ageBuckets.days60}</div>
          <div className="rounded-md bg-red-50 px-3 py-2 text-red-900">&gt;60 dias: {initial.ageBuckets.over60}</div>
          <div className="rounded-md bg-slate-100 px-3 py-2 text-slate-800">Sem data: {initial.ageBuckets.noDate}</div>
        </div>
      </section>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {orderedColumns.map((col) => (
          <div
            key={col.statusKey}
            className="min-w-[280px] max-w-[320px] shrink-0 rounded-xl border shadow-sm"
            style={{
              ...cssVarsToStyle(col.columnStyle),
              borderColor: "var(--col-border, #e2e8f0)",
              background: "var(--col-bg, #f8fafc)"
            }}
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDrop={() => onDropOnColumn(col.statusKey)}
          >
            <div
              className="cursor-grab border-b border-slate-200/80 px-3 py-2 active:cursor-grabbing"
              draggable
              onDragStart={() => setDragKey(col.statusKey)}
              onDragEnd={() => setDragKey(null)}
            >
              <h3 className="text-sm font-semibold">{col.statusKey}</h3>
              <p className="text-xs opacity-80">{col.count} no quadro (máx. 200)</p>
            </div>
            <div className="max-h-[70vh] space-y-2 overflow-y-auto p-2">
              {col.cards.map((card: KanbanCardDto) => (
                <button
                  key={card.glpiTicketId}
                  type="button"
                  className="w-full rounded-lg border border-slate-200/80 p-3 text-left text-sm shadow-sm transition hover:ring-2 hover:ring-slate-300"
                  style={parseInlineStyle(card.cardStyle)}
                  onClick={() => void openModal(card.glpiTicketId)}
                >
                  <div className="font-medium text-slate-900">#{card.glpiTicketId}</div>
                  <div className="mt-1 line-clamp-3 text-slate-700">{card.title || "(sem título)"}</div>
                  <div className="mt-2 text-xs text-slate-600">
                    <span className={`rounded px-1 py-0.5 ${pendClassStyle(card.pendClass)}`}>{card.pendLabel}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-600">{card.requesterName}</div>
                  <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-slate-500">
                    <span title={card.syncTip}>Aberto há {card.openFor}</span>
                    <span>Parado há {card.idleFor}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {modalId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">Chamado #{modalId}</h2>
              <button type="button" className="text-sm text-slate-500 hover:text-slate-800" onClick={closeModal}>
                Fechar
              </button>
            </div>
            {detailErr ? <p className="mt-2 text-sm text-red-600">{detailErr}</p> : null}
            {!detail && !detailErr ? <p className="mt-4 text-sm text-slate-600">A carregar…</p> : null}
            {detail ? (
              <div className="mt-4 space-y-4">
                <label className="block text-xs font-medium text-slate-600">
                  Assunto
                  <input
                    className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-medium text-slate-600">
                    Estado (GLPI)
                    <select
                      className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                      value={editStatusId}
                      onChange={(e) => setEditStatusId(e.target.value)}
                    >
                      <option value="">(sem alteração)</option>
                      {detail.statusOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-medium text-slate-600">
                    Prioridade
                    <select
                      className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                      value={editPriorityId}
                      onChange={(e) => setEditPriorityId(e.target.value)}
                    >
                      <option value="">(sem alteração)</option>
                      {detail.priorityOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block text-xs font-medium text-slate-600">
                  Descrição (HTML do GLPI — edite com cuidado)
                  <textarea
                    className="mt-1 w-full rounded-md border border-slate-200 px-2 py-2 font-mono text-xs"
                    rows={10}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                  />
                </label>
                <div className="rounded-md border border-slate-100 bg-slate-50 p-3 text-xs text-slate-700">
                  <p>
                    <strong>Solicitante:</strong> {detail.requesterName} {detail.requesterEmail ? `· ${detail.requesterEmail}` : ""}
                  </p>
                  <p className="mt-1">
                    <strong>Grupo / entidade:</strong> {(detail.context.groups || []).join(", ") || "—"} ·{" "}
                    {detail.context.entity || "—"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                    disabled={Boolean(busy)}
                    onClick={() => void saveTicket()}
                  >
                    Guardar alterações no GLPI
                  </button>
                </div>
                <div className="border-t border-slate-200 pt-4">
                  <h3 className="text-sm font-semibold text-slate-900">Acompanhamento</h3>
                  <textarea
                    className="mt-2 w-full rounded-md border border-slate-200 px-2 py-2 text-sm"
                    rows={4}
                    placeholder="Mensagem a publicar no histórico do GLPI"
                    value={followupText}
                    onChange={(e) => setFollowupText(e.target.value)}
                  />
                  <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={followupPrivate} onChange={(e) => setFollowupPrivate(e.target.checked)} />
                    Privado (equipe)
                  </label>
                  <button
                    type="button"
                    className="mt-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
                    disabled={Boolean(busy)}
                    onClick={() => void sendFollowup()}
                  >
                    Publicar acompanhamento
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function pendClassStyle(pend: string): string {
  if (pend === "cliente") return "bg-amber-100 text-amber-900";
  if (pend === "empresa") return "bg-sky-100 text-sky-900";
  if (pend === "na") return "bg-emerald-100 text-emerald-900";
  if (pend === "unknown") return "bg-slate-200 text-slate-800";
  return "bg-slate-100 text-slate-700";
}

/** Converte estilo tipo `background:...;border:...` em objeto para React. */
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
