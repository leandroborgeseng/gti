"use client";

import type { CSSProperties } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { KanbanBoardPayload, KanbanCardDto } from "@/glpi/kanban-load";
import { pendenciaLabelForSummary } from "@/glpi/utils/kanban-filters";
import type { HistoryTimelineItemDto, TicketHistoryBundleDto } from "@/glpi/services/glpi-ticket-history.service";
import { sanitizeAndProxyTicketHtml } from "@/lib/glpi-ticket-html";
import { TicketHtmlPreview } from "@/components/chamados/ticket-html-preview";
import { TicketRichEditor } from "@/components/chamados/ticket-rich-editor";
import { AgingOpenDashboard } from "./aging-open-dashboard";
import { ChamadosOperationsPanel } from "./chamados-operations-panel";

type TicketSidebarDto = {
  typeLabel: string | null;
  requestOriginLabel: string | null;
  urgencyLabel: string | null;
  impactLabel: string | null;
  locationLabel: string | null;
  tagsLabel: string | null;
};

type TicketAttachmentDto = {
  id: string;
  filename: string;
  glpiUrl: string;
};

type GovernanceInTicketModal = {
  id: string;
  status: string;
  slaDeadline: string | null;
  priority: string | null;
  type: string | null;
  contractId: string;
  contractNumber: string;
  contractName: string;
};

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
  requesterUserId?: number | null;
  observers: Array<{ userId: number | null; displayName: string | null; email: string | null }>;
  context: { groups: string[]; assignees: string[]; category: string | null; entity: string | null };
  sidebar?: TicketSidebarDto;
  attachments?: TicketAttachmentDto[];
  statusOptions: Array<{ id: number; label: string }>;
  priorityOptions: Array<{ id: number; label: string }>;
  history?: TicketHistoryBundleDto | null;
  governance?: GovernanceInTicketModal | null;
};

const governanceStatusLabel: Record<string, string> = {
  OPEN: "Aberto",
  ACKNOWLEDGED: "Reconhecido",
  IN_PROGRESS: "Em tratamento",
  SLA_VIOLATED: "SLA violado",
  EXTENDED_DEADLINE: "Prazo prorrogado",
  ESCALATED: "Escalado",
  SENT_TO_CONTROLADORIA: "Na controladoria"
};

function glpiAssetProxyHref(glpiUrl: string): string {
  return `/api/glpi-asset?url=${encodeURIComponent(glpiUrl)}`;
}

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

function formatDateTimePtBr(iso: string | null): string {
  if (!iso?.trim()) {
    return "—";
  }
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    return iso;
  }
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(ms);
}

function plainTextFromHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  const [modalSection, setModalSection] = useState<"chamado" | "historico">("chamado");
  const [syncScopeDraft, setSyncScopeDraft] = useState<"open" | "all">(initial.ticketSyncScope);
  const [isClearingFilters, startClearingFiltersTransition] = useTransition();

  useEffect(() => {
    setSyncScopeDraft(initial.ticketSyncScope);
  }, [initial.ticketSyncScope]);

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
      if (!res.ok) throw new Error("Falha ao salvar ordem das colunas");
      setToast("Ordem das colunas salva.");
      setTimeout(() => setToast(null), 2500);
    } catch {
      setToast("Não foi possível salvar a ordem das colunas.");
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
    setModalSection("chamado");
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
    const msg = plainTextFromHtml(followupText);
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
        body: JSON.stringify({ content: followupText.trim(), isPrivate: followupPrivate })
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
      if (!res.ok) throw new Error("Falha ao salvar escopo");
      setToast("Escopo de sincronização salvo.");
      setTimeout(() => setToast(null), 2500);
      router.refresh();
    } catch {
      setToast("Não foi possível salvar o escopo.");
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
          pendencia: initial.pendenciaParam,
          requesterEmail: initial.requesterEmail,
          requesterName: initial.requesterName,
          ...(initial.assignedUserId != null && initial.assignedUserId > 0
            ? { assignedUserId: initial.assignedUserId }
            : {}),
          ...(initial.noAssignee ? { noAssignee: true } : {}),
          cohort: initial.cohortParam,
          idleMin: initial.idleMin,
          groupInJson: initial.groupInJson,
          groupNull: initial.groupNull
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

  const kanbanHrefQuery = useMemo(() => {
    const sp = new URLSearchParams();
    if (initial.q) sp.set("q", initial.q);
    if (initial.statusFilter) sp.set("status", initial.statusFilter);
    if (initial.groupFilter) sp.set("group", initial.groupFilter);
    if (initial.pendenciaParam) sp.set("pendencia", initial.pendenciaParam);
    if (initial.onlyOpen) sp.set("open", "1");
    if (initial.requesterEmail) sp.set("requesterEmail", initial.requesterEmail);
    if (initial.requesterName) sp.set("requesterName", initial.requesterName);
    if (initial.assignedUserId != null && initial.assignedUserId > 0) {
      sp.set("assignedUserId", String(initial.assignedUserId));
    }
    if (initial.noAssignee) {
      sp.set("noAssignee", "1");
    }
    if (initial.cohortParam) sp.set("cohort", initial.cohortParam);
    if (initial.ageBucketParam) sp.set("ageBucket", initial.ageBucketParam);
    if (initial.idleMin) sp.set("idleMin", initial.idleMin);
    if (initial.groupInJson?.trim()) sp.set("groupInJson", initial.groupInJson);
    if (initial.groupNull) sp.set("groupNull", "1");
    return sp.toString();
  }, [
    initial.q,
    initial.statusFilter,
    initial.groupFilter,
    initial.pendenciaParam,
    initial.onlyOpen,
    initial.requesterEmail,
    initial.requesterName,
    initial.assignedUserId,
    initial.noAssignee,
    initial.cohortParam,
    initial.ageBucketParam,
    initial.idleMin,
    initial.groupInJson,
    initial.groupNull
  ]);

  const chamadosHrefWithoutRequester = useMemo(() => {
    const sp = new URLSearchParams(kanbanHrefQuery);
    sp.delete("requesterEmail");
    sp.delete("requesterName");
    const qs = sp.toString();
    return (qs ? `/chamados?${qs}` : "/chamados") as Route;
  }, [kanbanHrefQuery]);

  const chamadosHrefWithoutAssigned = useMemo(() => {
    const sp = new URLSearchParams(kanbanHrefQuery);
    sp.delete("assignedUserId");
    sp.delete("noAssignee");
    const qs = sp.toString();
    return (qs ? `/chamados?${qs}` : "/chamados") as Route;
  }, [kanbanHrefQuery]);

  const chamadosHrefClearOpsDrill = useMemo(() => {
    const sp = new URLSearchParams(kanbanHrefQuery);
    sp.delete("cohort");
    sp.delete("ageBucket");
    sp.delete("idleMin");
    sp.delete("groupInJson");
    sp.delete("groupNull");
    const qs = sp.toString();
    return (qs ? `/chamados?${qs}` : "/chamados") as Route;
  }, [kanbanHrefQuery]);

  const hasActiveFilters = Boolean(kanbanHrefQuery);

  const clearKanbanFilters = useCallback(() => {
    startClearingFiltersTransition(() => {
      router.replace("/chamados" as Route);
    });
  }, [router, startClearingFiltersTransition]);

  const filterPills = useMemo(() => {
    const openLabel = initial.onlyOpen ? "Sim" : "Não";
    const solicitante =
      initial.requesterEmail?.trim() ||
      (initial.requesterName?.trim() ? `Nome: ${initial.requesterName.trim()}` : "");
    const cohortPill =
      initial.cohortParam === "ops_over30"
        ? "Coorte KPI >30d (16+ dias)"
        : initial.cohortParam === "ops_over60"
          ? "Coorte KPI >60d"
          : "";
    const ageBucketPill =
      initial.ageBucketParam === "week"
        ? "Esta semana (até 7 dias)"
        : initial.ageBucketParam === "days15"
          ? "8 a 15 dias"
          : initial.ageBucketParam === "days30"
            ? "16 a 30 dias"
            : initial.ageBucketParam === "days60"
              ? "31 a 60 dias"
              : initial.ageBucketParam === "over60"
                ? "Mais de 60 dias"
                : initial.ageBucketParam === "noDate"
                  ? "Sem data de abertura"
                  : "";
    const idlePill = initial.idleMin ? `Inatividade GLPI ≥ ${initial.idleMin} d` : "";
    const groupInPill = initial.groupInJson?.trim() ? "Top 3 grupos (concentração)" : "";
    const groupNullPill = initial.groupNull ? "Sem grupo (contrato)" : "";
    const assigneePill = initial.noAssignee
      ? "Só sem técnico (cache)"
      : initial.assignedUserId != null && initial.assignedUserId > 0
        ? initial.assignedUsers.find((u) => u.id === initial.assignedUserId)?.label ||
          `ID ${initial.assignedUserId}`
        : "";
    const statusPill =
      initial.statusFilter === "__NULL__" ? "Sem status" : initial.statusFilter || "Todos";
    const pill = (k: string, v: string, muted: boolean) => (
      <span key={k} className={`filter-pill${muted ? " filter-pill--muted" : ""}`}>
        <span className="filter-pill__k">{k}</span>
        <span className="filter-pill__v">{v}</span>
      </span>
    );
    return [
      pill("Busca", initial.q || "—", !initial.q),
      pill("Status", statusPill, !initial.statusFilter),
      pill("Grupo", initial.groupFilter || "Todos", !initial.groupFilter),
      pill("Abertos", openLabel, !initial.onlyOpen),
      pill("Pendência", pendenciaLabelForSummary(initial.pendenciaParam), initial.pendenciaParam === ""),
      pill("Solicitante", solicitante || "—", !solicitante),
      pill("Atribuído", assigneePill || "Todos", !assigneePill && !initial.noAssignee),
      pill("Coorte idade", cohortPill || "—", !cohortPill),
      pill("Faixa de idade", ageBucketPill || "—", !ageBucketPill),
      pill("Inatividade", idlePill || "—", !idlePill),
      pill("Grupos (IN)", groupInPill || "—", !groupInPill),
      pill("Sem grupo", groupNullPill || "—", !groupNullPill),
      pill(
        "Sync cache",
        initial.ticketSyncScope === "all" ? "Todos os tickets" : "Só abertos (cache reduzido)",
        initial.ticketSyncScope === "open"
      )
    ];
  }, [initial]);

  const historyHtmlByItem = useMemo(() => {
    const items = detail?.history?.items;
    if (!items?.length) return new Map<number, string>();
    const m = new Map<number, string>();
    items.forEach((item: HistoryTimelineItemDto, i: number) => {
      m.set(i, sanitizeAndProxyTicketHtml(item.contentHtml || ""));
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

      <AgingOpenDashboard
        buckets={initial.ageBuckets}
        kanbanHrefQuery={kanbanHrefQuery}
        activeAgeBucket={initial.ageBucketParam}
      />

      <ChamadosOperationsPanel
        summary={initial.operationsSummary}
        ticketSyncScope={initial.ticketSyncScope}
        kanbanHrefQuery={kanbanHrefQuery}
      />

      <div className="kanban-filters-stack">
        <div className="filters-shell">
          <header className="filters-shell__head">
            <h2 className="filters-shell__title">Filtros do Kanban</h2>
            <p className="filters-shell__lede">
              Aplicam ao quadro, ao painel de idade, aos indicadores de operação (stock aberto) e ao recálculo de pendência
              (até 200 cards por coluna)
            </p>
          </header>
          <div className="filters-shell__pills" aria-label="Filtros aplicados">
            {filterPills}
          </div>
          {initial.requesterEmail || initial.requesterName ? (
            <p className="filters-shell__requester-clear">
              <Link href={chamadosHrefWithoutRequester} className="filters-shell__requester-clear-link">
                Remover filtro de solicitante
              </Link>
            </p>
          ) : null}
          {initial.noAssignee || (initial.assignedUserId != null && initial.assignedUserId > 0) ? (
            <p className="filters-shell__requester-clear">
              <Link href={chamadosHrefWithoutAssigned} className="filters-shell__requester-clear-link">
                {initial.noAssignee
                  ? "Remover filtro «só sem técnico» / técnico atribuído"
                  : "Remover filtro de técnico atribuído"}
              </Link>
            </p>
          ) : null}
          {initial.cohortParam || initial.ageBucketParam || initial.idleMin || initial.groupInJson?.trim() || initial.groupNull ? (
            <p className="filters-shell__requester-clear">
              <Link href={chamadosHrefClearOpsDrill} className="filters-shell__requester-clear-link">
                Remover coorte / faixa de idade / inatividade / top 3 grupos
              </Link>
            </p>
          ) : null}
          <form id="kanban-filters-form" className="filters-grid" method="get" action="/chamados">
            <label>
              Busca
              <input type="text" name="q" defaultValue={initial.q} placeholder="ID, título ou conteúdo" autoComplete="off" />
            </label>
            <label>
              Status
              <select name="status" defaultValue={initial.statusFilter}>
                <option value="">Todos</option>
                <option value="__NULL__">Sem status</option>
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
              Atribuído (técnico)
              <select
                name="assignedUserId"
                defaultValue={
                  initial.noAssignee
                    ? ""
                    : initial.assignedUserId != null && initial.assignedUserId > 0
                      ? String(initial.assignedUserId)
                      : ""
                }
                title="Filtra por técnico GLPI salvo no cache (users_id_tech)"
                disabled={initial.noAssignee}
              >
                <option value="">Todos</option>
                {initial.assignedUserId != null &&
                initial.assignedUserId > 0 &&
                !initial.assignedUsers.some((u) => u.id === initial.assignedUserId) ? (
                  <option value={String(initial.assignedUserId)}>
                    Usuário #{initial.assignedUserId}
                  </option>
                ) : null}
                {initial.assignedUsers.map((u) => (
                  <option key={u.id} value={String(u.id)}>
                    {u.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="filters-grid__checkbox">
              <input
                type="checkbox"
                name="noAssignee"
                value="1"
                defaultChecked={initial.noAssignee}
              />{" "}
              Só sem técnico atribuído (cache)
            </label>
            <label>
              Pendência
              <select name="pendencia" defaultValue={initial.pendenciaParam} title="Inferência no cache">
                <option value="">Todas</option>
                <option value="cliente">Cliente</option>
                <option value="empresa">Empresa</option>
                <option value="desconhecido">Indefinido</option>
                <option value="na">Encerrado</option>
                <option value="nao_inferido">Não inferido</option>
              </select>
            </label>
            <label>
              Só abertos
              <select name="open" defaultValue={initial.onlyOpen ? "1" : "0"}>
                <option value="0">Não</option>
                <option value="1">Sim</option>
              </select>
            </label>
            {initial.requesterEmail ? <input type="hidden" name="requesterEmail" value={initial.requesterEmail} /> : null}
            {initial.requesterName ? <input type="hidden" name="requesterName" value={initial.requesterName} /> : null}
            {initial.cohortParam ? <input type="hidden" name="cohort" value={initial.cohortParam} /> : null}
            {initial.ageBucketParam ? <input type="hidden" name="ageBucket" value={initial.ageBucketParam} /> : null}
            {initial.idleMin ? <input type="hidden" name="idleMin" value={initial.idleMin} /> : null}
            {initial.groupInJson?.trim() ? (
              <input type="hidden" name="groupInJson" value={initial.groupInJson} />
            ) : null}
            {initial.groupNull ? <input type="hidden" name="groupNull" value="1" /> : null}
          </form>
          <footer className="filters-shell__sync">
            <div className="filters-shell__sync-row">
              <span className="filters-shell__sync-h">Cache</span>
              <select
                id="sync-scope-select"
                className="filters-shell__sync-select"
                aria-label="Escopo de sincronização no cache GLPI"
                title="Aplica-se ao próximo ciclo de sincronização (worker/cron)"
                value={syncScopeDraft}
                disabled={Boolean(busy)}
                onChange={(e) => setSyncScopeDraft(e.target.value === "all" ? "all" : "open")}
              >
                <option value="all">
                  Todos os tickets — recomendado (abertos a cada ciclo do cron; fechados na passagem diária)
                </option>
                <option value="open">Só abertos (cache menor; sem fechados / sem gráfico de fechamentos)</option>
              </select>
              <button type="submit" form="kanban-filters-form" className="btn-secondary" id="btn-filters-apply">
                Aplicar
              </button>
              <button
                type="button"
                className="btn-secondary"
                id="btn-filters-clear"
                disabled={!hasActiveFilters || isClearingFilters}
                onClick={clearKanbanFilters}
              >
                {isClearingFilters ? "A limpar…" : "Limpar filtros"}
              </button>
              <button
                type="button"
                className="btn-secondary"
                id="btn-save-sync-scope"
                disabled={Boolean(busy)}
                onClick={() => void saveSyncScope(syncScopeDraft)}
              >
                Salvar escopo
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
                {busy === "colunas" ? "Salvando ordem das colunas…" : "Processando…"}
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
                        {card.assigneeLabel ? (
                          <div className="card-meta">
                            Atribuído: <strong>{card.assigneeLabel}</strong>
                          </div>
                        ) : null}
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
          <div className="modal-panel modal-panel--glpi">
            <div className="modal-header modal-header--glpi">
              <div className="modal-header--glpi__titles">
                <h2 id="ticket-modal-title" className="ticket-modal-header-title">
                  {detail?.name?.trim() ? `${detail.name} (#${modalId})` : `Chamado #${modalId}`}
                </h2>
                {process.env.NEXT_PUBLIC_GTI_BUILD ? (
                  <span className="ticket-modal-build-id" title="Identificador do deploy (NEXT_PUBLIC_GTI_BUILD)">
                    {process.env.NEXT_PUBLIC_GTI_BUILD}
                  </span>
                ) : null}
              </div>
              <button type="button" className="modal-close" onClick={closeModal} aria-label="Fechar">
                ✕
              </button>
            </div>
            {detailErr ? <p className="modal-error" style={{ padding: "0 1.35rem", marginTop: "0.75rem" }}>{detailErr}</p> : null}
            {!detail && !detailErr ? (
              <p className="modal-hint" style={{ padding: "1.35rem" }}>
                Carregando…
              </p>
            ) : null}
            {detail ? (
              <form
                id="ticket-edit-form"
                className="ticket-glpi-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveTicket();
                }}
              >
                <div className="ticket-glpi-shell">
                  <nav className="ticket-glpi-nav" aria-label="Secções do chamado">
                    <button
                      type="button"
                      className={`ticket-glpi-nav__btn${modalSection === "chamado" ? " is-active" : ""}`}
                      onClick={() => setModalSection("chamado")}
                    >
                      Chamado
                    </button>
                    <button
                      type="button"
                      className={`ticket-glpi-nav__btn${modalSection === "historico" ? " is-active" : ""}`}
                      onClick={() => setModalSection("historico")}
                    >
                      Histórico
                    </button>
                  </nav>

                  <div className="ticket-glpi-main">
                    {modalSection === "chamado" ? (
                      <>
                        <div className="glpi-ticket-title-row">
                          <label className="glpi-ticket-title-field">
                            <span className="modal-field-label">Título</span>
                            <input
                              className="glpi-ticket-title-input"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                            />
                          </label>
                        </div>

                        <div className="glpi-message-card">
                          <div className="glpi-message-card__head">
                            <div className="glpi-message-card__dates">
                              <span>
                                <strong>Abertura:</strong> {formatDateTimePtBr(detail.dateCreation)}
                              </span>
                              <span>
                                <strong>Última modificação:</strong> {formatDateTimePtBr(detail.dateModification)}
                              </span>
                            </div>
                            <div className="glpi-message-card__actors-line">
                              <strong>Solicitante:</strong>{" "}
                              <span className="glpi-chip glpi-chip--requester">{detail.requesterName || "—"}</span>
                              {detail.requesterEmail ? (
                                <span className="glpi-message-card__email">{detail.requesterEmail}</span>
                              ) : null}
                            </div>
                          </div>
                          <div className="glpi-message-card__body">
                            <TicketHtmlPreview
                              html={editContent}
                              emptyLabel="(sem descrição)"
                              className="ticket-html-preview--glpi-body"
                            />
                          </div>
                        </div>

                        {detail.attachments && detail.attachments.length > 0 ? (
                          <div className="glpi-ticket-attachments">
                            <h4 className="glpi-ticket-attachments__title">Anexos ({detail.attachments.length})</h4>
                            <ul className="glpi-ticket-attachments__list">
                              {detail.attachments.map((doc) => (
                                <li key={`${doc.id}-${doc.glpiUrl}`}>
                                  <a
                                    href={glpiAssetProxyHref(doc.glpiUrl)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="glpi-ticket-attachments__link"
                                  >
                                    {doc.filename}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        <details className="glpi-editor-details">
                          <summary>Editar descrição (editor rich text)</summary>
                          <p className="modal-hint modal-hint--tight">
                            O cartão acima mostra o HTML como no GLPI (imagens inline e ligações via proxy). Aqui altera o
                            texto a salvar no GLPI.
                          </p>
                          <TicketRichEditor
                            value={editContent}
                            onChange={setEditContent}
                            variant="description"
                            aria-label="Descrição do chamado"
                          />
                        </details>

                        <div className="ticket-followup-composer glpi-followup-card">
                          <div className="modal-field modal-field-rich">
                            <span className="modal-field-label">Novo acompanhamento</span>
                            <p className="modal-hint modal-hint--tight">
                              Publicado no histórico do GLPI (formatação e imagens quando suportadas).
                            </p>
                            <TicketRichEditor
                              value={followupText}
                              onChange={setFollowupText}
                              variant="followup"
                              aria-label="Texto do novo acompanhamento"
                            />
                          </div>
                          <label className="ticket-followup-private">
                            <input
                              type="checkbox"
                              checked={followupPrivate}
                              onChange={(e) => setFollowupPrivate(e.target.checked)}
                            />
                            Privado (equipe)
                          </label>
                          <div className="ticket-followup-actions">
                            <button
                              type="button"
                              className="btn-secondary"
                              disabled={Boolean(busy)}
                              onClick={() => void sendFollowup()}
                            >
                              Publicar acompanhamento
                            </button>
                          </div>
                        </div>

                        <div className="modal-actions modal-actions--glpi">
                          <button type="button" className="btn-secondary" onClick={closeModal}>
                            Cancelar
                          </button>
                          <button type="submit" id="ticket-edit-submit" disabled={Boolean(busy)}>
                            Salvar alterações no GLPI
                          </button>
                        </div>
                      </>
                    ) : (
                      <div id="ticket-history-section" className="ticket-glpi-history-panel">
                        {detail.history?.historyError ? (
                          <p id="ticket-history-api-error">Aviso ao carregar historico GLPI: {detail.history.historyError}</p>
                        ) : null}
                        {detail.history ? (
                          <>
                            <div className={`waiting-banner waiting-${detail.history.waitingOn}`}>
                              {detail.history.waitingLabel ? <strong>{detail.history.waitingLabel}</strong> : null}
                              {detail.history.waitingDetail ? (
                                <span className="small" style={{ display: "block", marginTop: "0.35rem" }}>
                                  {detail.history.waitingDetail}
                                </span>
                              ) : null}
                            </div>
                            <h3 className="history-heading">Histórico</h3>
                            <p className="history-help">
                              Linha do tempo carregada do GLPI (imagens e anexos inline passam pelo proxy local).
                            </p>
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
                          </>
                        ) : (
                          <p className="modal-hint">Sem dados de histórico para este chamado.</p>
                        )}
                      </div>
                    )}
                  </div>

                  <aside className="ticket-glpi-aside" aria-label="Atributos e atores">
                    <h3 className="ticket-glpi-aside__title">Atributos</h3>
                    <p className="ticket-glpi-aside__id">GLPI #{detail.glpiTicketId}</p>

                    <label className="modal-field glpi-aside-field">
                      Estado
                      <select value={editStatusId} onChange={(e) => setEditStatusId(e.target.value)}>
                        <option value="">(sem alteração)</option>
                        {detail.statusOptions.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="glpi-aside-current">Atual: {detail.statusLabel || "—"}</p>

                    <label className="modal-field glpi-aside-field">
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
                    <p className="glpi-aside-current">Atual: {detail.priorityLabel || "—"}</p>

                    {detail.sidebar?.typeLabel ? (
                      <div className="glpi-aside-kv">
                        <span className="glpi-aside-kv__k">Tipo</span>
                        <span className="glpi-aside-kv__v">{detail.sidebar.typeLabel}</span>
                      </div>
                    ) : null}
                    {detail.sidebar?.requestOriginLabel ? (
                      <div className="glpi-aside-kv">
                        <span className="glpi-aside-kv__k">Origem</span>
                        <span className="glpi-aside-kv__v">{detail.sidebar.requestOriginLabel}</span>
                      </div>
                    ) : null}
                    {detail.sidebar?.urgencyLabel ? (
                      <div className="glpi-aside-kv">
                        <span className="glpi-aside-kv__k">Urgência</span>
                        <span className="glpi-aside-kv__v">{detail.sidebar.urgencyLabel}</span>
                      </div>
                    ) : null}
                    {detail.sidebar?.impactLabel ? (
                      <div className="glpi-aside-kv">
                        <span className="glpi-aside-kv__k">Impacto</span>
                        <span className="glpi-aside-kv__v">{detail.sidebar.impactLabel}</span>
                      </div>
                    ) : null}
                    {detail.sidebar?.locationLabel ? (
                      <div className="glpi-aside-kv">
                        <span className="glpi-aside-kv__k">Localização</span>
                        <span className="glpi-aside-kv__v">{detail.sidebar.locationLabel}</span>
                      </div>
                    ) : null}
                    {detail.sidebar?.tagsLabel ? (
                      <div className="glpi-aside-kv">
                        <span className="glpi-aside-kv__k">Etiquetas</span>
                        <span className="glpi-aside-kv__v">{detail.sidebar.tagsLabel}</span>
                      </div>
                    ) : null}

                    <div className="glpi-aside-kv">
                      <span className="glpi-aside-kv__k">Entidade</span>
                      <span className="glpi-aside-kv__v">{detail.context.entity || "—"}</span>
                    </div>
                    <div className="glpi-aside-kv">
                      <span className="glpi-aside-kv__k">Categoria</span>
                      <span className="glpi-aside-kv__v">{detail.context.category || "—"}</span>
                    </div>
                    <div className="glpi-aside-kv">
                      <span className="glpi-aside-kv__k">Grupo (cache)</span>
                      <span className="glpi-aside-kv__v">{detail.contractGroupName || "—"}</span>
                    </div>

                    <div className="glpi-governance-card" aria-label="Governança de chamados (sistema)">
                      <h4 className="ticket-glpi-aside__subtitle">Governança (sistema)</h4>
                      {detail.governance ? (
                        <>
                          <p className="glpi-governance-card__status">
                            <strong>{governanceStatusLabel[detail.governance.status] ?? detail.governance.status}</strong>
                            {detail.governance.slaDeadline ? (
                              <span className="glpi-governance-card__sla">
                                {" "}
                                · Prazo SLA: {formatDateTimePtBr(detail.governance.slaDeadline)}
                              </span>
                            ) : null}
                          </p>
                          <p className="glpi-governance-card__contract">
                            Contrato:{" "}
                            <Link
                              href={`/contracts/${detail.governance.contractId}` as Route}
                              className="glpi-governance-card__link"
                            >
                              {detail.governance.contractNumber} — {detail.governance.contractName}
                            </Link>
                          </p>
                          <Link
                            href={`/governance/tickets/${detail.governance.id}` as Route}
                            className="glpi-governance-card__cta"
                          >
                            Abrir registro de governança
                          </Link>
                        </>
                      ) : (
                        <p className="glpi-aside-muted glpi-governance-card__empty">
                          Sem registro com <span className="font-mono">ticketId</span> igual a{" "}
                          <span className="font-mono">{detail.glpiTicketId}</span> ou{" "}
                          <span className="font-mono">#{detail.glpiTicketId}</span>. Cadastre em Governança se aplicável.
                        </p>
                      )}
                    </div>

                    <h4 className="ticket-glpi-aside__subtitle">Atores</h4>
                    <div className="glpi-aside-actors">
                      <div className="glpi-aside-actors__row">
                        <span className="glpi-aside-actors__label">Solicitante</span>
                        <span className="glpi-chip glpi-chip--requester">{detail.requesterName || "—"}</span>
                      </div>
                      {detail.requesterUserId != null && detail.requesterUserId > 0 ? (
                        <p className="glpi-aside-actors__hint">Usuário #{detail.requesterUserId}</p>
                      ) : null}
                      <div className="glpi-aside-actors__row">
                        <span className="glpi-aside-actors__label">Observadores</span>
                        <div className="glpi-chip-list">
                          {detail.observers?.length ? (
                            detail.observers.map((o, idx) => (
                              <span key={`${o.userId ?? "o"}-${idx}`} className="glpi-chip">
                                {o.displayName || "—"}
                              </span>
                            ))
                          ) : (
                            <span className="glpi-aside-muted">—</span>
                          )}
                        </div>
                      </div>
                      <div className="glpi-aside-actors__row">
                        <span className="glpi-aside-actors__label">Grupos atribuídos</span>
                        <div className="glpi-chip-list">
                          {(detail.context.groups || []).length ? (
                            detail.context.groups.map((g) => (
                              <span key={g} className="glpi-chip glpi-chip--group">
                                {g}
                              </span>
                            ))
                          ) : (
                            <span className="glpi-aside-muted">—</span>
                          )}
                        </div>
                      </div>
                      <div className="glpi-aside-actors__row">
                        <span className="glpi-aside-actors__label">Técnicos</span>
                        <div className="glpi-chip-list">
                          {(detail.context.assignees || []).length ? (
                            detail.context.assignees.map((a) => (
                              <span key={a} className="glpi-chip glpi-chip--tech">
                                {a}
                              </span>
                            ))
                          ) : (
                            <span className="glpi-aside-muted">—</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </aside>
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
