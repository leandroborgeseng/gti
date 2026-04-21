"use client";

import { ChevronDown, ChevronRight, MessageSquare, Paperclip, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import type { ProjectGroupWithTasks, ProjectTaskPatchPayload, ProjectTaskTree } from "@/lib/api";
import { attachmentDownloadUrl, getAuthMe, patchProjectTask, uploadProjectTaskAttachment } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  aggregateStatusByKind,
  classifyStatus,
  normStatus,
  STATUS_KIND_COLORS,
  STATUS_KIND_LABEL,
  STATUS_KIND_ORDER,
  type ProjectTaskStatusKind
} from "@/lib/projects-task-status";
import { cn } from "@/lib/utils";

const STATUS_PRESETS = ["Feito", "Em progresso", "Não iniciado", "Bloqueado", "Parado", "Em validação"];

/** Paleta de grupos alinhada ao Monday (cores por grupo). */
const GROUP_ACCENTS = ["#ff007f", "#00c875", "#579bfc", "#fdab3d", "#a358df", "#7c3aed", "#ff6900"] as const;

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function groupAccentHex(groupId: string, groupIndex: number): string {
  return GROUP_ACCENTS[(hashStr(groupId) + groupIndex) % GROUP_ACCENTS.length]!;
}

function countTasksRecursive(nodes: ProjectTaskTree[]): number {
  return nodes.reduce((acc, n) => acc + 1 + countTasksRecursive(n.children ?? []), 0);
}

/** Fundo da célula de status estilo Monday (pill preenchida na célula). */
function statusCellColors(status: string): { bg: string; fg: string } {
  return STATUS_KIND_COLORS[classifyStatus(status)];
}

function StatusDistributionFooterBar({ counts }: { counts: Record<ProjectTaskStatusKind, number> }): JSX.Element {
  const total = STATUS_KIND_ORDER.reduce((s, k) => s + counts[k], 0);
  if (total === 0) {
    return <span className="text-[11px] text-[#c5c7d0]">—</span>;
  }
  return (
    <div
      className="flex h-3 w-full min-w-[80px] overflow-hidden rounded-sm bg-[#e6e9ef] dark:bg-neutral-800"
      role="img"
      aria-label={`Distribuição de status em ${total} tarefas`}
    >
      {STATUS_KIND_ORDER.map((kind) => {
        const n = counts[kind];
        if (n <= 0) return null;
        const pct = (n / total) * 100;
        const bg = STATUS_KIND_COLORS[kind].bg;
        const label = STATUS_KIND_LABEL[kind];
        return (
          <div
            key={kind}
            className="h-full min-w-[2px] transition-[flex-grow] duration-300 ease-out"
            style={{ flex: `${n} 1 0%`, backgroundColor: bg }}
            title={`${label}: ${n} (${pct.toFixed(0)}%)`}
          />
        );
      })}
    </div>
  );
}

function FooterStatusLegend({ counts }: { counts: Record<ProjectTaskStatusKind, number> }): JSX.Element {
  const parts: string[] = [];
  for (const kind of STATUS_KIND_ORDER) {
    const n = counts[kind];
    if (n <= 0) continue;
    parts.push(`${n} ${STATUS_KIND_LABEL[kind]}`);
  }
  if (parts.length === 0) {
    return <span className="text-[#c5c7d0]">—</span>;
  }
  const text = parts.join(" · ");
  return (
    <span className="block truncate text-[11px] leading-tight text-[#676879]" title={text}>
      {text}
    </span>
  );
}

function isDoneLike(status: string): boolean {
  return classifyStatus(status) === "done";
}

function pmfBadgeClass(name: string): string {
  const n = normStatus(name);
  if (n.includes("pedro")) return "bg-red-500 text-white";
  if (n.includes("marcio")) return "bg-amber-500 text-white";
  if (n.includes("alan")) return "bg-emerald-600 text-white";
  if (n.includes("lucas")) return "bg-sky-600 text-white";
  if (n.includes("caio")) return "bg-teal-600 text-white";
  if (n.includes("andre")) return "bg-indigo-600 text-white";
  return "bg-violet-600 text-white";
}

function PmfPill({ name }: { name: string }): JSX.Element | null {
  const raw = name.trim();
  if (!raw) return <span className="text-[#c5c7d0]">—</span>;
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold shadow-sm ring-1 ring-black/10",
        pmfBadgeClass(raw)
      )}
    >
      {raw}
    </span>
  );
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

function formatBoardDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

function dueDateToInputValue(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return "";
  }
}

function dateInputToPayload(isoDay: string): string {
  if (!isoDay.trim()) return "";
  const d = new Date(`${isoDay}T12:00:00`);
  return d.toISOString();
}

function taskAttachments(task: ProjectTaskTree): NonNullable<ProjectTaskTree["attachments"]> {
  return task.attachments ?? [];
}

/** Garante `children` e `attachments` sempre como arrays (evita subtarefas invisíveis se o JSON vier incompleto). */
function ensureTaskTree(t: ProjectTaskTree): ProjectTaskTree {
  const raw = t.children;
  const ch = Array.isArray(raw) ? raw : [];
  return {
    ...t,
    attachments: t.attachments ?? [],
    children: ch.map(ensureTaskTree)
  };
}

function normalizeProjectGroups(groups: ProjectGroupWithTasks[]): ProjectGroupWithTasks[] {
  return groups.map((g) => ({
    ...g,
    tasks: g.tasks.map(ensureTaskTree)
  }));
}

type FilesCellProps = {
  projectId: string;
  task: ProjectTaskTree;
  canEdit: boolean;
  busy: boolean;
  onUploaded: () => void;
};

function FilesCell({ projectId, task, canEdit, busy, onUploaded }: FilesCellProps): JSX.Element {
  const list = taskAttachments(task);
  const [uploading, setUploading] = useState(false);

  const onFile = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !canEdit) return;
    setUploading(true);
    try {
      await uploadProjectTaskAttachment(projectId, task.id, file);
      toast.success("Ficheiro enviado.");
      onUploaded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no envio.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1 px-2 text-[#676879] hover:bg-[#ececf0] hover:text-[#323338]"
          disabled={busy}
          title="Anexos"
        >
          <Paperclip className="h-3.5 w-3.5" />
          <span className="tabular-nums text-xs">{list.length}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-2 p-3">
        {list.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem ficheiros.</p>
        ) : (
          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
            {list.map((a) => (
              <li key={a.id} className="truncate">
                <Link
                  href={attachmentDownloadUrl(a.id)}
                  className="font-medium text-primary underline-offset-2 hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {a.fileName}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {canEdit ? (
          <div className="border-t border-border pt-2">
            <label className="block text-[11px] font-medium text-muted-foreground">Adicionar ficheiro</label>
            <input
              type="file"
              className="mt-1 block w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
              disabled={uploading || busy}
              onChange={(ev) => void onFile(ev)}
            />
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function ObservationCell({
  taskId,
  description,
  canEdit,
  busy,
  onPatch
}: {
  taskId: string;
  description: string | null | undefined;
  canEdit: boolean;
  busy: boolean;
  onPatch: (taskId: string, payload: ProjectTaskPatchPayload) => Promise<void>;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (open) setDraft(description ?? "");
  }, [open, description]);

  const text = (description ?? "").trim();

  if (!canEdit) {
    return (
      <span className="block max-w-md text-xs leading-snug text-[#323338]" title={text || undefined}>
        {text ? <span className="line-clamp-3 whitespace-pre-wrap">{description}</span> : <span className="text-[#c5c7d0]">—</span>}
      </span>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        disabled={busy}
        className={cn(
          "block w-full max-w-md rounded px-1.5 py-1 text-left text-xs leading-snug transition hover:bg-[#ececf0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#579bfc] focus-visible:ring-offset-1",
          text ? "text-[#323338]" : "text-[#c5c7d0]"
        )}
        aria-label={text ? "Editar observação" : "Adicionar observação"}
        title="Clique para abrir o editor"
        onClick={() => setOpen(true)}
      >
        {text ? (
          <span className="line-clamp-3 whitespace-pre-wrap">{description}</span>
        ) : (
          <span className="italic">Clique para adicionar observação</span>
        )}
      </button>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Observação</DialogTitle>
          <DialogDescription>Edite o texto abaixo. As alterações ficam registadas ao guardar.</DialogDescription>
        </DialogHeader>
        <textarea
          autoFocus
          className="min-h-[180px] w-full resize-y rounded-md border border-input bg-background p-3 text-sm leading-relaxed shadow-sm"
          value={draft}
          disabled={busy}
          aria-label="Texto da observação"
          onChange={(e) => setDraft(e.target.value)}
        />
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={() => {
              void (async () => {
                const v = draft.trim();
                const prev = (description ?? "").trim();
                if (v !== prev) await onPatch(taskId, { description: v });
                setOpen(false);
              })();
            }}
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type TaskRowsProps = {
  projectId: string;
  task: ProjectTaskTree;
  depth: number;
  accentHex: string;
  expanded: Record<string, boolean>;
  onToggleExpand: (taskId: string) => void;
  canEdit: boolean;
  savingTaskId: string | null;
  onPatch: (taskId: string, payload: ProjectTaskPatchPayload) => Promise<void>;
  onFilesUploaded: () => void;
};

function TaskRows({
  projectId,
  task,
  depth,
  accentHex,
  expanded,
  onToggleExpand,
  canEdit,
  savingTaskId,
  onPatch,
  onFilesUploaded
}: TaskRowsProps): JSX.Element {
  const hasChildren = Boolean(task.children?.length);
  const isOpen = expanded[task.id] !== false;
  const busy = savingTaskId === task.id;

  const toggle = useCallback(() => {
    onToggleExpand(task.id);
  }, [onToggleExpand, task.id]);

  const statusColors = statusCellColors(task.status);

  const statusOptions = useMemo(() => {
    const s = task.status.trim();
    const set = new Set<string>(["", ...STATUS_PRESETS]);
    if (s) set.add(s);
    return Array.from(set);
  }, [task.status]);

  return (
    <>
      <tr className={cn("min-h-9 border-b border-[#ececf0] bg-white transition-colors hover:bg-[#f6f7fb]", busy && "opacity-70")}>
        <td className="w-9 shrink-0 border-r border-[#ececf0] p-1 align-middle">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-[#c5c7d0] accent-[#00c875] focus:ring-2 focus:ring-[#00c875]/30"
            checked={isDoneLike(task.status)}
            disabled={!canEdit || busy}
            title={canEdit ? "Marcar como feito" : "Apenas leitura"}
            onChange={(e) => {
              void onPatch(task.id, { status: e.target.checked ? "Feito" : "Em progresso" });
            }}
          />
        </td>
        <td
          className="min-w-[220px] max-w-md border-r border-[#ececf0] p-0 align-middle"
          style={{ borderLeft: `4px solid ${accentHex}` }}
        >
          <div className="flex items-start gap-1.5 px-2 py-1.5" style={{ paddingLeft: 8 + depth * 16 }}>
            {hasChildren ? (
              <button
                type="button"
                onClick={toggle}
                className="mt-0.5 shrink-0 rounded p-0.5 text-[#676879] hover:bg-[#ececf0] hover:text-[#323338]"
                aria-expanded={isOpen}
                aria-label={isOpen ? "Recolher subtarefas" : "Expandir subtarefas"}
                title={isOpen ? "Recolher subtarefas" : "Expandir subtarefas"}
              >
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            ) : (
              <span className="inline-block w-5 shrink-0" />
            )}
            {hasChildren ? (
              <span
                className="mt-0.5 shrink-0 rounded-full bg-[#ececf0] px-1.5 py-0 text-[10px] font-semibold tabular-nums text-[#323338]"
                title="Número de subtarefas"
              >
                {task.children!.length}
              </span>
            ) : null}
            {canEdit ? (
              <input
                key={`${task.id}-title-${task.title}`}
                className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium leading-snug text-[#323338] hover:border-[#e6e9ef] focus:border-[#579bfc] focus:outline-none"
                defaultValue={task.title}
                disabled={busy}
                aria-label="Título da tarefa"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== task.title) void onPatch(task.id, { title: v });
                }}
              />
            ) : (
              <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-[#323338]">{task.title}</span>
            )}
            <span className="flex shrink-0 gap-0.5 opacity-35">
              <button type="button" className="rounded p-0.5 hover:bg-muted" title="Adicionar (em breve)" disabled>
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button type="button" className="rounded p-0.5 hover:bg-muted" title="Comentários (em breve)" disabled>
                <MessageSquare className="h-3.5 w-3.5" />
              </button>
            </span>
          </div>
        </td>
        <td className="w-[130px] border-r border-[#ececf0] bg-white p-1.5 align-middle">
          {canEdit ? (
            <div
              className="flex min-h-[32px] items-stretch justify-center rounded-md px-0.5 py-0.5"
              style={{ backgroundColor: statusColors.bg }}
            >
              <select
                className="max-w-full flex-1 cursor-pointer rounded-md border-0 bg-transparent px-1 py-1 text-center text-xs font-semibold outline-none ring-0 focus:ring-0"
                style={{ color: statusColors.fg }}
                value={task.status}
                disabled={busy}
                aria-label="Status"
                onChange={(e) => {
                  void onPatch(task.id, { status: e.target.value });
                }}
              >
                {statusOptions.map((opt) => (
                  <option key={opt || "__empty"} value={opt}>
                    {opt === "" ? "(vazio)" : opt}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div
              className="flex min-h-[32px] items-center justify-center rounded-md px-2 text-xs font-semibold"
              style={{ backgroundColor: statusColors.bg, color: statusColors.fg }}
            >
              {task.status.trim() ? task.status : "—"}
            </div>
          )}
        </td>
        <td className="min-w-[160px] border-r border-[#ececf0] bg-white p-2 align-middle">
          {canEdit ? (
            <div className="flex items-center gap-2">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#ececf0] text-[10px] font-bold text-[#323338] ring-1 ring-[#e6e9ef]"
                title={task.assigneeExternal ?? ""}
              >
                {task.assigneeExternal?.trim() ? initials(task.assigneeExternal) : "—"}
              </span>
              <input
                key={`${task.id}-person-${task.assigneeExternal ?? ""}`}
                className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-[#323338] hover:border-[#e6e9ef] focus:border-[#579bfc] focus:outline-none"
                defaultValue={task.assigneeExternal ?? ""}
                disabled={busy}
                placeholder="Pessoa"
                aria-label="Pessoa atribuída"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  const prev = (task.assigneeExternal ?? "").trim();
                  if (v !== prev) void onPatch(task.id, { assigneeExternal: v });
                }}
              />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {task.assigneeExternal?.trim() ? (
                <>
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#ececf0] text-[10px] font-bold text-[#323338] ring-1 ring-[#e6e9ef]"
                    title={task.assigneeExternal}
                  >
                    {initials(task.assigneeExternal)}
                  </span>
                  <span className="max-w-[140px] truncate text-xs text-[#323338]" title={task.assigneeExternal}>
                    {task.assigneeExternal}
                  </span>
                </>
              ) : (
                <span className="text-[#c5c7d0]">—</span>
              )}
            </div>
          )}
        </td>
        <td className="w-[110px] whitespace-nowrap border-r border-[#ececf0] bg-white p-2 align-middle">
          {canEdit ? (
            <input
              type="date"
              className="w-full max-w-[104px] rounded border border-input bg-background px-1 py-1 text-[11px] shadow-sm"
              value={dueDateToInputValue(task.dueDate)}
              disabled={busy}
              aria-label="Data limite"
              onChange={(e) => {
                const v = e.target.value;
                void onPatch(task.id, { dueDate: v ? dateInputToPayload(v) : "" });
              }}
            />
          ) : (
            <span className="text-xs text-muted-foreground">{formatBoardDate(task.dueDate)}</span>
          )}
        </td>
        <td className="min-w-[200px] max-w-md border-r border-[#ececf0] bg-white p-2 align-middle">
          <ObservationCell
            taskId={task.id}
            description={task.description}
            canEdit={canEdit}
            busy={busy}
            onPatch={onPatch}
          />
        </td>
        <td className="w-[120px] border-r border-[#ececf0] bg-white p-2 align-middle">
          {canEdit ? (
            <input
              key={`${task.id}-pmf-${task.internalResponsible ?? ""}`}
              className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-xs hover:border-border focus:border-primary focus:outline-none"
              defaultValue={task.internalResponsible ?? ""}
              disabled={busy}
              placeholder="Resp."
              aria-label="Responsável PMF"
              onBlur={(e) => {
                const v = e.target.value.trim();
                const prev = (task.internalResponsible ?? "").trim();
                if (v !== prev) void onPatch(task.id, { internalResponsible: v });
              }}
            />
          ) : (
            <PmfPill name={task.internalResponsible ?? ""} />
          )}
        </td>
        <td className="w-[88px] border-l border-transparent p-2 align-middle">
          <FilesCell projectId={projectId} task={task} canEdit={canEdit} busy={busy} onUploaded={onFilesUploaded} />
        </td>
      </tr>
      {hasChildren && isOpen
        ? task.children!.map((c) => (
            <TaskRows
              key={c.id}
              projectId={projectId}
              task={c}
              depth={depth + 1}
              accentHex={accentHex}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
              canEdit={canEdit}
              savingTaskId={savingTaskId}
              onPatch={onPatch}
              onFilesUploaded={onFilesUploaded}
            />
          ))
        : null}
    </>
  );
}

function GroupBoard({
  projectId,
  group,
  groupIndex,
  defaultExpanded,
  canEdit,
  savingTaskId,
  onPatch,
  onFilesUploaded
}: {
  projectId: string;
  group: ProjectGroupWithTasks;
  groupIndex: number;
  defaultExpanded: boolean;
  canEdit: boolean;
  savingTaskId: string | null;
  onPatch: (taskId: string, payload: ProjectTaskPatchPayload) => Promise<void>;
  onFilesUploaded: () => void;
}): JSX.Element {
  const accentHex = groupAccentHex(group.id, groupIndex);
  const rootCount = group.tasks.length;
  const totalCount = countTasksRecursive(group.tasks);

  const [open, setOpen] = useState(defaultExpanded);
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setExpandedTasks({});
  }, [projectId, group.id]);

  const initExpanded = useMemo(() => {
    const o: Record<string, boolean> = {};
    function walk(t: ProjectTaskTree): void {
      if (t.children?.length) o[t.id] = true;
      t.children?.forEach(walk);
    }
    group.tasks.forEach(walk);
    return o;
  }, [group.tasks]);

  const mergedExpanded = useMemo(() => ({ ...initExpanded, ...expandedTasks }), [initExpanded, expandedTasks]);

  const statusAgg = useMemo(() => aggregateStatusByKind(group.tasks), [group.tasks]);

  const toggleTaskExpand = useCallback(
    (taskId: string) => {
      setExpandedTasks((prev) => {
        const merged = { ...initExpanded, ...prev };
        const currentlyOpen = merged[taskId] !== false;
        return { ...prev, [taskId]: !currentlyOpen };
      });
    },
    [initExpanded]
  );

  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-[#e6e9ef] bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 border-b border-[#e6e9ef] bg-white px-3 py-2.5 text-left transition hover:bg-[#f6f7fb] dark:border-neutral-800 dark:hover:bg-neutral-900/80"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0" style={{ color: accentHex }} aria-hidden />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" style={{ color: accentHex }} aria-hidden />
        )}
        <span className="text-sm font-semibold tracking-tight" style={{ color: accentHex }}>
          {group.name}
        </span>
        <span className="ml-auto text-xs font-medium tabular-nums text-[#676879]">
          {rootCount} {rootCount === 1 ? "elemento" : "elementos"}
          {totalCount > rootCount ? (
            <span className="text-[#c5c7d0]"> · {totalCount} no total</span>
          ) : null}
        </span>
      </button>
      {open ? (
        <div className="overflow-x-auto bg-[#f6f7fb] dark:bg-neutral-950">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-[#e6e9ef] bg-[#fafbfc] text-left text-[11px] font-semibold uppercase tracking-wide text-[#676879] dark:border-neutral-800 dark:bg-neutral-900">
                <th className="w-9 border-r border-[#ececf0] p-2 dark:border-neutral-800" title="Concluído">
                  ✓
                </th>
                <th className="border-r border-[#ececf0] p-2 pl-3 dark:border-neutral-800">Elemento</th>
                <th className="w-[130px] border-r border-[#ececf0] p-2 dark:border-neutral-800">Status</th>
                <th className="min-w-[160px] border-r border-[#ececf0] p-2 dark:border-neutral-800">Pessoa</th>
                <th className="w-[110px] border-r border-[#ececf0] p-2 dark:border-neutral-800">Data</th>
                <th className="min-w-[200px] border-r border-[#ececf0] p-2 dark:border-neutral-800">Observação</th>
                <th className="w-[120px] border-r border-[#ececf0] p-2 dark:border-neutral-800">Resp. PMF</th>
                <th className="w-[88px] p-2">Arquivos</th>
              </tr>
            </thead>
            <tbody>
              {group.tasks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-sm text-[#676879]">
                    Sem tarefas neste grupo.
                  </td>
                </tr>
              ) : (
                group.tasks.map((t) => (
                  <TaskRows
                    key={t.id}
                    projectId={projectId}
                    task={t}
                    depth={0}
                    accentHex={accentHex}
                    expanded={mergedExpanded}
                    onToggleExpand={toggleTaskExpand}
                    canEdit={canEdit}
                    savingTaskId={savingTaskId}
                    onPatch={onPatch}
                    onFilesUploaded={onFilesUploaded}
                  />
                ))
              )}
            </tbody>
            {group.tasks.length > 0 ? (
              <tfoot>
                <tr className="border-t border-[#e6e9ef] bg-white dark:border-neutral-800 dark:bg-neutral-950">
                  <td
                    colSpan={2}
                    className="border-r border-[#ececf0] p-2 align-middle dark:border-neutral-800"
                    style={{ borderLeft: `4px solid ${accentHex}` }}
                  >
                    <span className="sr-only">Resumo de status de todas as tarefas do grupo</span>
                    <span className="text-[11px] font-medium text-[#676879]">Resumo de status</span>
                  </td>
                  <td className="w-[130px] border-r border-[#ececf0] p-2 align-middle dark:border-neutral-800">
                    <StatusDistributionFooterBar counts={statusAgg} />
                  </td>
                  <td colSpan={5} className="p-2 align-middle">
                    <FooterStatusLegend counts={statusAgg} />
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      ) : null}
    </div>
  );
}

type Props = {
  projectId: string;
  groups: ProjectGroupWithTasks[];
};

export function ProjectTasksBoard({ projectId, groups }: Props): JSX.Element {
  const router = useRouter();
  const [role, setRole] = useState<string | null | undefined>(undefined);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);

  useEffect(() => {
    void getAuthMe()
      .then((m) => setRole(m.role))
      .catch(() => setRole(null));
  }, []);

  const canEdit = role === "ADMIN" || role === "EDITOR";

  const onPatch = useCallback(
    async (taskId: string, payload: ProjectTaskPatchPayload) => {
      setSavingTaskId(taskId);
      try {
        await patchProjectTask(projectId, taskId, payload);
        toast.success("Alterações guardadas.");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao guardar.");
      } finally {
        setSavingTaskId(null);
      }
    },
    [projectId, router]
  );

  const onFilesUploaded = useCallback(() => {
    router.refresh();
  }, [router]);

  const displayGroups = useMemo(() => normalizeProjectGroups(groups), [groups]);

  return (
    <div className="space-y-2 rounded-lg border border-[#e6e9ef] bg-[#f6f7fb] p-2 dark:border-neutral-800 dark:bg-neutral-950">
      {role === undefined ? (
        <p className="text-xs text-[#676879]">A carregar permissões…</p>
      ) : null}
      {displayGroups.map((g, idx) => (
        <GroupBoard
          key={g.id}
          projectId={projectId}
          group={g}
          groupIndex={idx}
          defaultExpanded
          canEdit={canEdit}
          savingTaskId={savingTaskId}
          onPatch={onPatch}
          onFilesUploaded={onFilesUploaded}
        />
      ))}
    </div>
  );
}
