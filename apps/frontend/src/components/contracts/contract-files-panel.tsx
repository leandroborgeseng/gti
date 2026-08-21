"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { toast } from "sonner";
import {
  cancelContractFile,
  contractFileDownloadUrl,
  getContractFiles,
  inactivateContractFile,
  uploadContractFile,
  type ContractFileDocumentType,
  type ContractFileRecord,
  type ContractFileVisibility
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InlineLoading } from "@/components/ui/inline-loading";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const PAGE_SIZES = [10, 25, 50] as const;

const DOCUMENT_TYPE_LABELS: Record<ContractFileDocumentType, string> = {
  CONTRATO: "Contrato",
  TERMO_REFERENCIA: "Termo de referência",
  ETP: "ETP",
  EDITAL: "Edital",
  PROPOSTA: "Proposta",
  ATA: "Ata",
  PARECER: "Parecer",
  ADITIVO: "Aditivo",
  APOSTILAMENTO: "Apostilamento",
  NOTIFICACAO: "Notificação",
  OFICIO: "Ofício",
  RELATORIO: "Relatório",
  COMPROVANTE: "Comprovante",
  FISCALIZACAO: "Fiscalização",
  OUTROS: "Outros"
};

const STATUS_LABELS: Record<ContractFileRecord["status"], string> = {
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  REPLACED: "Substituído",
  CANCELLED: "Cancelado"
};

const VISIBILITY_LABELS: Record<ContractFileVisibility, string> = {
  INTERNAL_ONLY: "Somente interno",
  AVAILABLE_TO_SUPPLIER: "Disponível ao fornecedor"
};

type DraftFilters = {
  from: string;
  to: string;
  documentType: string;
  q: string;
};

const EMPTY_FILTERS: DraftFilters = {
  from: "",
  to: "",
  documentType: "ALL",
  q: ""
};

type UploadDraft = {
  documentType: ContractFileDocumentType;
  title: string;
  documentDate: string;
  referenceCode: string;
  notes: string;
  visibility: ContractFileVisibility;
  file: File | null;
};

function emptyUpload(): UploadDraft {
  return {
    documentType: "OUTROS",
    title: "",
    documentDate: new Date().toISOString().slice(0, 10),
    referenceCode: "",
    notes: "",
    visibility: "INTERNAL_ONLY",
    file: null
  };
}

function formatDatePt(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("pt-BR");
}

function formatBytes(size: number | null | undefined): string {
  if (size == null || !Number.isFinite(size)) return "-";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

type Props = {
  contractId: string;
};

export function ContractFilesPanel({ contractId }: Props): JSX.Element {
  const qc = useQueryClient();
  const qPerms = useMyPermissions();
  const canEdit = Boolean(qPerms.data?.keys?.includes("contracts.edit"));

  const [draft, setDraft] = useState<DraftFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<DraftFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(25);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadDraft, setUploadDraft] = useState<UploadDraft>(emptyUpload);
  const [actionFileId, setActionFileId] = useState<string | null>(null);
  const [actionKind, setActionKind] = useState<"cancel" | "inactivate" | null>(null);
  const [justification, setJustification] = useState("");

  const filterKey = useMemo(
    () =>
      JSON.stringify({
        page,
        pageSize,
        from: applied.from,
        to: applied.to,
        documentType: applied.documentType,
        q: applied.q
      }),
    [page, pageSize, applied]
  );

  const qFiles = useQuery({
    queryKey: queryKeys.contractFiles(contractId, filterKey),
    queryFn: () =>
      getContractFiles(contractId, {
        page,
        pageSize,
        from: applied.from || undefined,
        to: applied.to || undefined,
        documentType: applied.documentType === "ALL" ? undefined : applied.documentType,
        q: applied.q.trim() || undefined
      })
  });

  const items = qFiles.data?.items ?? [];
  const total = qFiles.data?.total ?? 0;
  const pageCount = qFiles.data?.pageCount ?? 0;

  function applyFilters(): void {
    setApplied({ ...draft });
    setPage(1);
  }

  function clearFilters(): void {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
  }

  const uploadMut = useMutation({
    mutationFn: () => {
      if (!uploadDraft.file) throw new Error("Selecione um arquivo.");
      if (!uploadDraft.title.trim()) throw new Error("Informe o título.");
      if (!uploadDraft.documentDate) throw new Error("Informe a data do documento.");
      return uploadContractFile(contractId, {
        file: uploadDraft.file,
        documentType: uploadDraft.documentType,
        title: uploadDraft.title.trim(),
        documentDate: uploadDraft.documentDate,
        notes: uploadDraft.notes.trim() || undefined,
        referenceCode: uploadDraft.referenceCode.trim() || undefined,
        visibility: uploadDraft.visibility
      });
    },
    onSuccess: async () => {
      toast.success("Arquivo enviado.");
      setUploadDraft(emptyUpload());
      setShowUpload(false);
      await qc.invalidateQueries({ queryKey: ["gestao", "contract-files", contractId] });
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar o arquivo.");
    }
  });

  const statusMut = useMutation({
    mutationFn: async () => {
      if (!actionFileId || !actionKind) throw new Error("Arquivo não selecionado.");
      const reason = justification.trim();
      if (reason.length < 3) throw new Error("Informe a justificativa (mínimo 3 caracteres).");
      if (actionKind === "cancel") return cancelContractFile(contractId, actionFileId, reason);
      return inactivateContractFile(contractId, actionFileId, reason);
    },
    onSuccess: async () => {
      toast.success(actionKind === "cancel" ? "Arquivo cancelado." : "Arquivo inativado.");
      setActionFileId(null);
      setActionKind(null);
      setJustification("");
      await qc.invalidateQueries({ queryKey: ["gestao", "contract-files", contractId] });
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Não foi possível atualizar o arquivo.");
    }
  });

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Arquivos do contrato</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Documentos originais vinculados ao contrato (contrato, TR, edital, aditivos etc.). Listagem paginada com
            download; o envio exige permissão de edição.
          </p>
        </div>
        <span className="text-xs text-slate-500">
          {qFiles.isFetching ? (
            <InlineLoading label="Carregando..." />
          ) : (
            `${total} arquivo${total === 1 ? "" : "s"}`
          )}
        </span>
      </div>

      <div className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
            <span>Tipo documental</span>
            <Select
              value={draft.documentType}
              onValueChange={(v) => setDraft((d) => ({ ...d, documentType: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos</SelectItem>
                {(Object.keys(DOCUMENT_TYPE_LABELS) as ContractFileDocumentType[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {DOCUMENT_TYPE_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-xs text-slate-600">
            <span>Busca</span>
            <Input
              placeholder="Título, arquivo, referência…"
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
          {canEdit ? (
            <Button
              type="button"
              size="sm"
              variant={showUpload ? "secondary" : "default"}
              className="ml-auto"
              onClick={() => setShowUpload((v) => !v)}
            >
              {showUpload ? "Fechar envio" : "Enviar arquivo"}
            </Button>
          ) : null}
          <div className={`flex items-center gap-2 text-xs text-slate-600 ${canEdit ? "" : "ml-auto"}`}>
            <span>Por página</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v) as (typeof PAGE_SIZES)[number]);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 w-[4.5rem]">
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

      {showUpload && canEdit ? (
        <div className="mt-4 space-y-3 rounded-lg border border-slate-200 p-3">
          <h3 className="text-sm font-semibold text-slate-900">Novo arquivo</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-xs text-slate-600">
              <span>Tipo documental</span>
              <Select
                value={uploadDraft.documentType}
                onValueChange={(v) =>
                  setUploadDraft((d) => ({ ...d, documentType: v as ContractFileDocumentType }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(DOCUMENT_TYPE_LABELS) as ContractFileDocumentType[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {DOCUMENT_TYPE_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1 text-xs text-slate-600">
              <span>Data do documento</span>
              <Input
                type="date"
                value={uploadDraft.documentDate}
                onChange={(e) => setUploadDraft((d) => ({ ...d, documentDate: e.target.value }))}
              />
            </label>
            <label className="space-y-1 text-xs text-slate-600 sm:col-span-2">
              <span>Título</span>
              <Input
                value={uploadDraft.title}
                onChange={(e) => setUploadDraft((d) => ({ ...d, title: e.target.value }))}
                placeholder="Ex.: Contrato assinado"
              />
            </label>
            <label className="space-y-1 text-xs text-slate-600">
              <span>Código / referência (opcional)</span>
              <Input
                value={uploadDraft.referenceCode}
                onChange={(e) => setUploadDraft((d) => ({ ...d, referenceCode: e.target.value }))}
              />
            </label>
            <label className="space-y-1 text-xs text-slate-600">
              <span>Visibilidade</span>
              <Select
                value={uploadDraft.visibility}
                onValueChange={(v) =>
                  setUploadDraft((d) => ({ ...d, visibility: v as ContractFileVisibility }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(VISIBILITY_LABELS) as ContractFileVisibility[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {VISIBILITY_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1 text-xs text-slate-600 sm:col-span-2">
              <span>Observações (opcional)</span>
              <Textarea
                rows={2}
                value={uploadDraft.notes}
                onChange={(e) => setUploadDraft((d) => ({ ...d, notes: e.target.value }))}
              />
            </label>
            <label className="space-y-1 text-xs text-slate-600 sm:col-span-2">
              <span>Arquivo (PDF, imagens, DOCX, XLSX, ZIP ou TXT · limite padrão 10 MB)</span>
              <input
                type="file"
                className="mt-1 block w-full max-w-lg text-sm file:mr-2 file:rounded file:border-0 file:bg-slate-200 file:px-3 file:py-1"
                onChange={(e) =>
                  setUploadDraft((d) => ({ ...d, file: e.target.files?.[0] ?? null }))
                }
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={uploadMut.isPending}
              onClick={() => uploadMut.mutate()}
            >
              {uploadMut.isPending ? "Enviando…" : "Confirmar envio"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={uploadMut.isPending}
              onClick={() => {
                setShowUpload(false);
                setUploadDraft(emptyUpload());
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        {qFiles.isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando arquivos…</p>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">Nenhum arquivo encontrado.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {items.map((row) => (
              <li key={row.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium text-slate-900">{row.title}</p>
                  <p className="text-xs text-slate-600">
                    {DOCUMENT_TYPE_LABELS[row.documentType] ?? row.documentType} ·{" "}
                    {formatDatePt(row.documentDate)} · {STATUS_LABELS[row.status]} ·{" "}
                    {VISIBILITY_LABELS[row.visibility]}
                  </p>
                  <p className="truncate text-xs text-slate-500" title={row.fileName}>
                    {row.fileName} · {formatBytes(row.fileSize)}
                    {row.referenceCode ? ` · Ref.: ${row.referenceCode}` : ""}
                  </p>
                  {row.uploadedByLabel ? (
                    <p className="text-xs text-slate-500">Enviado por {row.uploadedByLabel}</p>
                  ) : null}
                  {row.replaceReason && row.status !== "ACTIVE" ? (
                    <p className="text-xs text-amber-800">Justificativa: {row.replaceReason}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs" asChild>
                    <Link href={contractFileDownloadUrl(contractId, row.id)} prefetch={false}>
                      <Download className="h-3.5 w-3.5" />
                      Descarregar
                    </Link>
                  </Button>
                  {canEdit && row.status === "ACTIVE" ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => {
                          setActionFileId(row.id);
                          setActionKind("inactivate");
                          setJustification("");
                        }}
                      >
                        Inativar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs text-red-700"
                        onClick={() => {
                          setActionFileId(row.id);
                          setActionKind("cancel");
                          setJustification("");
                        }}
                      >
                        Cancelar
                      </Button>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {actionFileId && actionKind ? (
        <div className="mt-4 space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
          <p className="text-sm font-medium text-slate-900">
            {actionKind === "cancel" ? "Cancelar arquivo" : "Inativar arquivo"}
          </p>
          <label className="block space-y-1 text-xs text-slate-600">
            <span>Justificativa</span>
            <Textarea
              rows={2}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Informe o motivo (mínimo 3 caracteres)"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={statusMut.isPending}
              onClick={() => statusMut.mutate()}
            >
              {statusMut.isPending ? "Salvando…" : "Confirmar"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={statusMut.isPending}
              onClick={() => {
                setActionFileId(null);
                setActionKind(null);
                setJustification("");
              }}
            >
              Desistir
            </Button>
          </div>
        </div>
      ) : null}

      {pageCount > 1 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
          <span>
            Página {page} de {pageCount}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page <= 1 || qFiles.isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page >= pageCount || qFiles.isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
