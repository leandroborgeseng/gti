"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  attachmentDownloadUrl,
  deleteGlosaAttachment,
  deleteMeasurementAttachment,
  deleteProjectTaskAttachment,
  type AttachmentRecord
} from "@/lib/api";
import { attachmentPreviewKind } from "@/lib/attachment-preview-kind";
import { Download, Loader2, MoreHorizontal, Trash2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

/** Campos suficientes para listar e pré-visualizar anexos (medição, glosa ou tarefa de projeto). */
export type GestaoAttachmentListItem = Pick<AttachmentRecord, "id" | "fileName" | "mimeType">;

export type GestaoAttachmentsContext =
  | { scope: "measurement"; measurementId: string }
  | { scope: "glosa"; glosaId: string }
  | { scope: "projectTask"; projectId: string; taskId: string };

type Props = {
  attachments: GestaoAttachmentListItem[];
  /** Quem pode enviar/remove anexo (ADMIN/EDITOR). Viewer só vê. */
  canMutate: boolean;
  /** Context para chamada DELETE à API */
  gestaoCtx: GestaoAttachmentsContext;
  /** Após remover com sucesso (ex.: `router.refresh()`) */
  onDeleted?: () => void | Promise<void>;
  /** Lista compacta (popover de tarefas) vs bloco maior (medições/glosa). */
  compact?: boolean;
};

export function GestaoAttachmentsList(props: Props): JSX.Element {
  const { attachments, canMutate, gestaoCtx, onDeleted, compact } = props;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<GestaoAttachmentListItem | null>(null);

  const previewUrlForViewer = useMemo(() => {
    if (!viewer) return null;
    const kind = attachmentPreviewKind(viewer.mimeType);
    return kind !== "none" ? attachmentDownloadUrl(viewer.id, { inline: true }) : null;
  }, [viewer]);

  async function performDelete(attId: string): Promise<void> {
    setBusyId(attId);
    try {
      if (gestaoCtx.scope === "measurement") {
        await deleteMeasurementAttachment(gestaoCtx.measurementId, attId);
      } else if (gestaoCtx.scope === "glosa") {
        await deleteGlosaAttachment(gestaoCtx.glosaId, attId);
      } else {
        await deleteProjectTaskAttachment(gestaoCtx.projectId, gestaoCtx.taskId, attId);
      }
      setViewer((v) => (v?.id === attId ? null : v));
      setConfirmDeleteId(null);
      await onDeleted?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível remover o anexo.");
    } finally {
      setBusyId(null);
    }
  }

  function openViewer(att: GestaoAttachmentListItem): void {
    setViewer(att);
  }

  if (attachments.length === 0) {
    return <></>;
  }

  return (
    <>
      <ul className={compact ? "max-h-40 space-y-1 overflow-y-auto text-xs" : "space-y-2"}>
        {attachments.map((a) => (
          <li
            key={a.id}
            className={`flex flex-wrap items-center gap-1 ${compact ? "truncate" : "text-sm"} text-slate-700`}
          >
            {!compact ? (
              <button
                type="button"
                className="min-w-0 truncate text-left font-medium text-slate-900 underline decoration-slate-300 underline-offset-2 transition hover:decoration-slate-900"
                onClick={() => openViewer(a)}
              >
                {a.fileName}
              </button>
            ) : (
              <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => openViewer(a)}>
                {a.fileName}
              </button>
            )}
            {!compact ? <span className="text-xs text-slate-500">{a.mimeType}</span> : null}

            {!compact ? (
              <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" asChild>
                <Link href={attachmentDownloadUrl(a.id)} prefetch={false}>
                  <Download className="h-3.5 w-3.5" />
                  Descarregar
                </Link>
              </Button>
            ) : null}

            {canMutate ? (
              compact ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="h-7 w-8 shrink-0 p-0" disabled={busyId === a.id}>
                      {busyId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoreHorizontal className="h-3.5 w-3.5" />}
                      <span className="sr-only">Menu do anexo</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem asChild>
                      <Link href={attachmentDownloadUrl(a.id)} prefetch={false}>
                        Descarregar
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-red-700 focus:text-red-700" onClick={() => setConfirmDeleteId(a.id)}>
                      Remover…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs text-red-700 hover:bg-red-50 hover:text-red-800"
                  disabled={busyId === a.id}
                  onClick={() => setConfirmDeleteId(a.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remover
                </Button>
              )
            ) : null}
          </li>
        ))}
      </ul>

      <Dialog open={Boolean(viewer)} onOpenChange={(o) => !o && setViewer(null)}>
        <DialogContent
          className={viewer && attachmentPreviewKind(viewer.mimeType) !== "none" ? "max-w-[min(960px,calc(100vw-2rem))]" : "max-w-lg"}
          aria-describedby={undefined}
        >
          {viewer ? (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8 text-base">{viewer.fileName}</DialogTitle>
              </DialogHeader>
              {previewUrlForViewer ? (
                <div className="max-h-[75vh] w-full overflow-hidden rounded-md border bg-muted/40">
                  {attachmentPreviewKind(viewer.mimeType) === "pdf" ? (
                    <iframe title={`Pré-visualização PDF: ${viewer.fileName}`} src={previewUrlForViewer} className="h-[min(75vh,700px)] w-full" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- URL autenticada por cookie mesmo domínio
                    <img
                      alt={viewer.fileName}
                      src={previewUrlForViewer}
                      className="mx-auto max-h-[75vh] w-auto max-w-full object-contain"
                    />
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Este tipo de ficheiro não pode ser pré-visualizado no navegador. Utilize o botão para descarregar.
                </p>
              )}
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="secondary" asChild>
                  <Link href={attachmentDownloadUrl(viewer.id)} prefetch={false}>
                    <Download className="mr-2 h-4 w-4" />
                    Descarregar
                  </Link>
                </Button>
                {canMutate ? (
                  <Button type="button" variant="destructive" onClick={() => setConfirmDeleteId(viewer.id)}>
                    Remover…
                  </Button>
                ) : null}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDeleteId !== null} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remover anexo</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Esta operação não pode ser desfeita. O ficheiro deixa de estar disponível no sistema.
          </p>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setConfirmDeleteId(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busyId !== null || !confirmDeleteId}
              onClick={() => confirmDeleteId && void performDelete(confirmDeleteId)}
            >
              {busyId !== null ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remover definitivamente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
