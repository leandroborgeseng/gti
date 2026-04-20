"use client";

import { ChevronDown, ChevronRight, MessageSquare, Paperclip, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type Dispatch,
  type SetStateAction
} from "react";
import { toast } from "sonner";
import type { ProjectGroupWithTasks, ProjectTaskPatchPayload, ProjectTaskTree } from "@/lib/api";
import { attachmentDownloadUrl, getAuthMe, patchProjectTask, uploadProjectTaskAttachment } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const STATUS_PRESETS = ["Feito", "Em progresso", "Não iniciado", "Bloqueado", "Parado", "Em validação"];

function normStatus(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase();
}

function isDoneLike(status: string): boolean {
  const n = normStatus(status);
  return n.includes("feito") || n.includes("conclu") || n.includes("done");
}

function StatusPill({ status }: { status: string }): JSX.Element | null {
  const raw = status.trim();
  if (!raw) return <span className="text-muted-foreground">—</span>;
  const n = normStatus(raw);
  let cls =
    "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold text-white shadow-sm";
  if (n.includes("feito") || n.includes("conclu") || n.includes("done")) {
    cls = cn(cls, "bg-emerald-500");
  } else if (n.includes("progresso") || n.includes("andamento") || n.includes("progress")) {
    cls = cn(cls, "bg-amber-500");
  } else if (n.includes("parado") || n.includes("bloque") || n.includes("hold")) {
    cls = cn(cls, "bg-slate-500");
  } else if (n.includes("nao") && n.includes("inici")) {
    cls = cn(cls, "bg-slate-400");
  } else {
    cls = cn(cls, "bg-violet-600");
  }
  return <span className={cls}>{raw}</span>;
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
  if (!raw) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("inline-flex rounded-md px-2 py-0.5 text-xs font-semibold shadow-sm", pmfBadgeClass(raw))}>
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

function subProgressPercent(task: ProjectTaskTree): number | null {
  const ch = task.children;
  if (!ch?.length) return null;
  const done = ch.filter((c) => isDoneLike(c.status)).length;
  return Math.round((done / ch.length) * 100);
}

function SubElementBar({ task }: { task: ProjectTaskTree }): JSX.Element {
  const pct = subProgressPercent(task);
  if (pct == null) {
    return <div className="h-2 max-w-[120px] rounded-full bg-muted" />;
  }
  return (
    <div className="h-2 max-w-[140px] overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-emerald-500 transition-[width]"
        style={{ width: `${pct}%` }}
        title={`${pct}% concluído nos subelementos`}
      />
    </div>
  );
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
          className="h-8 gap-1 px-2 text-muted-foreground hover:text-foreground"
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

type TaskRowsProps = {
  projectId: string;
  task: ProjectTaskTree;
  depth: number;
  expanded: Record<string, boolean>;
  setExpanded: Dispatch<SetStateAction<Record<string, boolean>>>;
  canEdit: boolean;
  savingTaskId: string | null;
  onPatch: (taskId: string, payload: ProjectTaskPatchPayload) => Promise<void>;
  onFilesUploaded: () => void;
};

function TaskRows({
  projectId,
  task,
  depth,
  expanded,
  setExpanded,
  canEdit,
  savingTaskId,
  onPatch,
  onFilesUploaded
}: TaskRowsProps): JSX.Element {
  const hasChildren = Boolean(task.children?.length);
  const isOpen = expanded[task.id] !== false;
  const busy = savingTaskId === task.id;

  const toggle = useCallback(() => {
    setExpanded((prev) => ({ ...prev, [task.id]: prev[task.id] === false ? true : false }));
  }, [setExpanded, task.id]);

  const statusOptions = useMemo(() => {
    const s = task.status.trim();
    const set = new Set<string>(["", ...STATUS_PRESETS]);
    if (s) set.add(s);
    return Array.from(set);
  }, [task.status]);

  return (
    <>
      <tr className={cn("border-b border-border transition-colors hover:bg-muted/40", busy && "opacity-70")}>
        <td className="w-9 shrink-0 border-r border-border p-1 align-middle">
          <input
            type="checkbox"
            className="rounded border-input"
            checked={isDoneLike(task.status)}
            disabled={!canEdit || busy}
            title={canEdit ? "Marcar como feito" : "Apenas leitura"}
            onChange={(e) => {
              void onPatch(task.id, { status: e.target.checked ? "Feito" : "Em progresso" });
            }}
          />
        </td>
        <td className="min-w-[220px] max-w-md border-r border-border p-2 align-middle">
          <div className="flex items-start gap-1.5" style={{ paddingLeft: depth * 18 }}>
            {hasChildren ? (
              <button
                type="button"
                onClick={toggle}
                className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-expanded={isOpen}
                aria-label={isOpen ? "Recolher subtarefas" : "Expandir subtarefas"}
              >
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            ) : (
              <span className="inline-block w-5 shrink-0" />
            )}
            {hasChildren ? (
              <span
                className="mt-0.5 shrink-0 rounded bg-muted px-1.5 py-0 text-[10px] font-semibold tabular-nums text-muted-foreground"
                title="Número de subtarefas"
              >
                {task.children!.length}
              </span>
            ) : null}
            {canEdit ? (
              <input
                key={`${task.id}-title-${task.title}`}
                className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium leading-snug text-foreground hover:border-border focus:border-primary focus:outline-none"
                defaultValue={task.title}
                disabled={busy}
                aria-label="Título da tarefa"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== task.title) void onPatch(task.id, { title: v });
                }}
              />
            ) : (
              <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-foreground">{task.title}</span>
            )}
            <span className="flex shrink-0 gap-0.5 opacity-40">
              <button type="button" className="rounded p-0.5 hover:bg-muted" title="Adicionar (em breve)" disabled>
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button type="button" className="rounded p-0.5 hover:bg-muted" title="Comentários (em breve)" disabled>
                <MessageSquare className="h-3.5 w-3.5" />
              </button>
            </span>
          </div>
        </td>
        <td className="w-[150px] border-r border-border p-2 align-middle">
          <SubElementBar task={task} />
        </td>
        <td className="w-[130px] border-r border-border p-2 align-middle">
          {canEdit ? (
            <select
              className="max-w-[124px] rounded-md border border-input bg-background px-1 py-1 text-xs font-medium shadow-sm"
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
          ) : (
            <StatusPill status={task.status} />
          )}
        </td>
        <td className="min-w-[160px] border-r border-border p-2 align-middle">
          {canEdit ? (
            <div className="flex items-center gap-2">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground ring-1 ring-border"
                title={task.assigneeExternal ?? ""}
              >
                {task.assigneeExternal?.trim() ? initials(task.assigneeExternal) : "—"}
              </span>
              <input
                key={`${task.id}-person-${task.assigneeExternal ?? ""}`}
                className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs hover:border-border focus:border-primary focus:outline-none"
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
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground ring-1 ring-border"
                    title={task.assigneeExternal}
                  >
                    {initials(task.assigneeExternal)}
                  </span>
                  <span className="max-w-[140px] truncate text-xs text-foreground" title={task.assigneeExternal}>
                    {task.assigneeExternal}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </div>
          )}
        </td>
        <td className="w-[110px] whitespace-nowrap border-r border-border p-2 align-middle">
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
        <td className="w-[90px] border-r border-border p-2 align-middle text-right">
          {canEdit ? (
            <input
              key={`${task.id}-effort-${task.effort ?? ""}`}
              className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-right text-xs tabular-nums hover:border-border focus:border-primary focus:outline-none"
              defaultValue={task.effort != null && String(task.effort).trim() !== "" ? String(task.effort) : ""}
              disabled={busy}
              inputMode="decimal"
              placeholder="—"
              aria-label="Números / esforço"
              onBlur={(e) => {
                const raw = e.target.value.trim().replace(",", ".");
                if (raw === "") return;
                const n = Number(raw);
                if (!Number.isFinite(n)) {
                  toast.error("Indique um número válido para esforço.");
                  return;
                }
                const prev = task.effort != null && String(task.effort).trim() !== "" ? Number(String(task.effort).replace(",", ".")) : null;
                if (prev === n) return;
                void onPatch(task.id, { effort: n });
              }}
            />
          ) : (
            <span className="text-xs tabular-nums text-foreground">
              {task.effort != null && String(task.effort).trim() !== "" ? task.effort : "—"}
            </span>
          )}
        </td>
        <td className="min-w-[180px] max-w-xs border-r border-border p-2 align-middle">
          {canEdit ? (
            <textarea
              key={`${task.id}-desc-${task.description ?? ""}`}
              className="min-h-[44px] w-full resize-y rounded border border-input bg-background px-2 py-1 text-xs leading-snug shadow-sm"
              defaultValue={task.description ?? ""}
              disabled={busy}
              rows={2}
              aria-label="Observação"
              onBlur={(e) => {
                const v = e.target.value.trim();
                const prev = (task.description ?? "").trim();
                if (v !== prev) void onPatch(task.id, { description: v });
              }}
            />
          ) : (
            <span className="line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground" title={task.description ?? undefined}>
              {task.description?.trim() ? task.description : "—"}
            </span>
          )}
        </td>
        <td className="w-[120px] border-r border-border p-2 align-middle">
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
        <td className="w-[88px] p-2 align-middle">
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
              expanded={expanded}
              setExpanded={setExpanded}
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
  defaultExpanded,
  canEdit,
  savingTaskId,
  onPatch,
  onFilesUploaded
}: {
  projectId: string;
  group: ProjectGroupWithTasks;
  defaultExpanded: boolean;
  canEdit: boolean;
  savingTaskId: string | null;
  onPatch: (taskId: string, payload: ProjectTaskPatchPayload) => Promise<void>;
  onFilesUploaded: () => void;
}): JSX.Element {
  const [open, setOpen] = useState(defaultExpanded);
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});

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

  return (
    <div className="mb-6 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 border-b border-violet-200/80 bg-violet-100 px-3 py-2.5 text-left transition hover:bg-violet-100/90 dark:border-violet-900/50 dark:bg-violet-950/40 dark:hover:bg-violet-950/60"
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-violet-700 dark:text-violet-300" /> : <ChevronRight className="h-4 w-4 shrink-0 text-violet-700 dark:text-violet-300" />}
        <span className="text-sm font-semibold tracking-tight text-violet-900 dark:text-violet-100">{group.name}</span>
        <span className="ml-auto text-xs font-medium text-violet-700/80 dark:text-violet-300/80">
          {group.tasks.length} na raiz
        </span>
      </button>
      {open ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="w-9 border-r border-border p-2" title="Concluído">
                  ✓
                </th>
                <th className="border-r border-border p-2">Elemento</th>
                <th className="w-[150px] border-r border-border p-2">Subelementos</th>
                <th className="w-[130px] border-r border-border p-2">Status</th>
                <th className="min-w-[160px] border-r border-border p-2">Pessoa</th>
                <th className="w-[110px] border-r border-border p-2">Data</th>
                <th className="w-[90px] border-r border-border p-2">Números</th>
                <th className="min-w-[180px] border-r border-border p-2">Observação</th>
                <th className="w-[120px] border-r border-border p-2">Resp. PMF</th>
                <th className="w-[88px] p-2">Arquivos</th>
              </tr>
            </thead>
            <tbody className="bg-background">
              {group.tasks.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-6 text-center text-sm text-muted-foreground">
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
                    expanded={mergedExpanded}
                    setExpanded={setExpandedTasks}
                    canEdit={canEdit}
                    savingTaskId={savingTaskId}
                    onPatch={onPatch}
                    onFilesUploaded={onFilesUploaded}
                  />
                ))
              )}
            </tbody>
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

  return (
    <div className="space-y-2">
      {role === undefined ? (
        <p className="text-xs text-muted-foreground">A carregar permissões…</p>
      ) : null}
      {groups.map((g) => (
        <GroupBoard
          key={g.id}
          projectId={projectId}
          group={g}
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
