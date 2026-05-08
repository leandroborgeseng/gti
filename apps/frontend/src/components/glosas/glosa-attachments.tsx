"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { GestaoAttachmentsList } from "@/components/attachments/attachment-preview-modal";
import type { AttachmentRecord } from "@/lib/api";
import { uploadGlosaAttachment } from "@/lib/api";

export function GlosaAttachments(props: {
  glosaId: string;
  attachments: AttachmentRecord[];
  canMutate: boolean;
}): JSX.Element {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !props.canMutate) {
      return;
    }
    setError(null);
    setUploading(true);
    try {
      await uploadGlosaAttachment(props.glosaId, file);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no envio do arquivo");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {props.canMutate ? (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Enviar anexo</span>
          <span className="text-xs text-slate-500">
            PDF, imagens, DOCX, XLSX, ZIP ou TXT. Limite configurável no servidor (padrão 10 MB).
          </span>
          <input
            type="file"
            disabled={uploading}
            onChange={(e) => void onFileChange(e)}
            className="max-w-md text-sm file:mr-2 file:rounded file:border-0 file:bg-slate-200 file:px-3 file:py-1"
          />
        </label>
      ) : null}
      {uploading ? <p className="text-xs text-slate-500">A enviar…</p> : null}
      {props.attachments.length === 0 && !uploading ? (
        <p className="text-sm text-slate-500">Nenhum anexo nesta glosa.</p>
      ) : props.attachments.length > 0 ? (
        <GestaoAttachmentsList
          attachments={props.attachments}
          canMutate={props.canMutate}
          gestaoCtx={{ scope: "glosa", glosaId: props.glosaId }}
          onDeleted={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}
