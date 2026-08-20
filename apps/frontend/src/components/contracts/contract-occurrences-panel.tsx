"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  changeContractOccurrenceStatus,
  createContractOccurrence,
  deleteContractOccurrence,
  forwardOccurrenceToControladoria,
  getMyPermissions,
  updateContractControladoriaCase,
  updateContractOccurrence,
  type Contract,
  type ContractControladoriaCase,
  type ContractControladoriaCaseStatus,
  type ContractOccurrence,
  type ContractOccurrenceOrigin,
  type ContractOccurrenceSeverity,
  type ContractOccurrenceStatus,
  type ContractOccurrenceType,
  type CreateContractOccurrencePayload,
  type UpdateContractControladoriaCasePayload
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UserSelect } from "@/components/ui/user-multi-select";
import { cn } from "@/lib/utils";

type Props = {
  contract: Contract;
};

type OccurrenceDraft = {
  type: ContractOccurrenceType;
  origin: ContractOccurrenceOrigin;
  title: string;
  description: string;
  detectionDate: string;
  linkedPricingItemIds: string;
  linkedFeatureIds: string;
  linkedMeasurementIds: string;
  linkedGlosaIds: string;
  linkedScheduleIds: string;
  severity: ContractOccurrenceSeverity;
  internalResponsibleUserId: string;
  regularizationDeadline: string;
  conclusion: string;
  evidenceNotes: string;
};

const TYPE_OPTIONS: Array<{ value: ContractOccurrenceType; label: string }> = [
  { value: "DESCUMPRIMENTO_SLA", label: "Descumprimento de SLA" },
  { value: "ATRASO_ENTREGA", label: "Atraso de entrega" },
  { value: "FALHA_QUALIDADE", label: "Falha de qualidade" },
  { value: "INCIDENTE_OPERACIONAL", label: "Incidente operacional" },
  { value: "NAO_CONFORMIDADE", label: "Não conformidade" },
  { value: "RECLAMACAO", label: "Reclamação" },
  { value: "AUDITORIA", label: "Auditoria" },
  { value: "OUTRO", label: "Outro" }
];

const ORIGIN_OPTIONS: Array<{ value: ContractOccurrenceOrigin; label: string }> = [
  { value: "FISCALIZACAO", label: "Fiscalização" },
  { value: "MEDICAO", label: "Medição" },
  { value: "CHAMADO_GLPI", label: "Chamado GLPI" },
  { value: "EMPRESA", label: "Empresa" },
  { value: "AUDITORIA_INTERNA", label: "Auditoria interna" },
  { value: "DENUNCIA", label: "Denúncia" },
  { value: "CONTROLADORIA", label: "Controladoria" },
  { value: "OUTRO", label: "Outro" }
];

const SEVERITY_OPTIONS: Array<{ value: ContractOccurrenceSeverity; label: string }> = [
  { value: "BAIXA", label: "Baixa" },
  { value: "MEDIA", label: "Média" },
  { value: "ALTA", label: "Alta" },
  { value: "CRITICA", label: "Crítica" }
];

const STATUS_OPTIONS: Array<{ value: ContractOccurrenceStatus; label: string }> = [
  { value: "EM_ANALISE", label: "Em análise" },
  { value: "AGUARDANDO_PROVIDENCIA_INTERNA", label: "Aguardando providência interna" },
  { value: "AGUARDANDO_EMPRESA", label: "Aguardando empresa" },
  { value: "EM_REGULARIZACAO", label: "Em regularização" },
  { value: "REGULARIZADA", label: "Regularizada" },
  { value: "NAO_REGULARIZADA", label: "Não regularizada" },
  { value: "REINCIDENTE", label: "Reincidente" },
  { value: "ENCAMINHADA_CONTROLADORIA", label: "Encaminhada à Controladoria" },
  { value: "EM_PROCESSO_ADMINISTRATIVO", label: "Em processo administrativo" },
  { value: "CONCLUIDA", label: "Concluída" },
  { value: "ARQUIVADA", label: "Arquivada" }
];

const CASE_STATUS_OPTIONS: Array<{ value: ContractControladoriaCaseStatus; label: string }> = [
  { value: "EM_PREPARACAO", label: "Em preparação" },
  { value: "ENCAMINHADO", label: "Encaminhado" },
  { value: "RECEBIDO_CONTROLADORIA", label: "Recebido na Controladoria" },
  { value: "COMPLEMENTACAO_SOLICITADA", label: "Complementação solicitada" },
  { value: "EM_INSTRUCAO", label: "Em instrução" },
  { value: "AGUARDANDO_DEFESA", label: "Aguardando defesa" },
  { value: "EM_ANALISE", label: "Em análise" },
  { value: "AGUARDANDO_DECISAO", label: "Aguardando decisão" },
  { value: "EM_RECURSO", label: "Em recurso" },
  { value: "CONCLUIDO", label: "Concluído" },
  { value: "ARQUIVADO", label: "Arquivado" }
];

function labelOf<T extends string>(options: Array<{ value: T; label: string }>, value: T): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

function toDateInput(value?: string | null): string {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function formatDateBr(value?: string | null): string {
  const raw = toDateInput(value);
  if (!raw) return "-";
  const [y, m, d] = raw.split("-");
  if (!y || !m || !d) return raw;
  return `${d}/${m}/${y}`;
}

function parseIdList(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    )
  );
}

function emptyDraft(): OccurrenceDraft {
  return {
    type: "NAO_CONFORMIDADE",
    origin: "FISCALIZACAO",
    title: "",
    description: "",
    detectionDate: new Date().toISOString().slice(0, 10),
    linkedPricingItemIds: "",
    linkedFeatureIds: "",
    linkedMeasurementIds: "",
    linkedGlosaIds: "",
    linkedScheduleIds: "",
    severity: "MEDIA",
    internalResponsibleUserId: "",
    regularizationDeadline: "",
    conclusion: "",
    evidenceNotes: ""
  };
}

function fromOccurrence(o: ContractOccurrence): OccurrenceDraft {
  return {
    type: o.type,
    origin: o.origin,
    title: o.title,
    description: o.description ?? "",
    detectionDate: toDateInput(o.detectionDate),
    linkedPricingItemIds: (o.linkedPricingItemIds ?? []).join(", "),
    linkedFeatureIds: (o.linkedFeatureIds ?? []).join(", "),
    linkedMeasurementIds: (o.linkedMeasurementIds ?? []).join(", "),
    linkedGlosaIds: (o.linkedGlosaIds ?? []).join(", "),
    linkedScheduleIds: (o.linkedScheduleIds ?? []).join(", "),
    severity: o.severity,
    internalResponsibleUserId: o.internalResponsibleUserId ?? "",
    regularizationDeadline: toDateInput(o.regularizationDeadline),
    conclusion: o.conclusion ?? "",
    evidenceNotes: o.evidenceNotes ?? ""
  };
}

function draftToPayload(draft: OccurrenceDraft): CreateContractOccurrencePayload {
  return {
    type: draft.type,
    origin: draft.origin,
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    detectionDate: draft.detectionDate,
    linkedPricingItemIds: parseIdList(draft.linkedPricingItemIds),
    linkedFeatureIds: parseIdList(draft.linkedFeatureIds),
    linkedMeasurementIds: parseIdList(draft.linkedMeasurementIds),
    linkedGlosaIds: parseIdList(draft.linkedGlosaIds),
    linkedScheduleIds: parseIdList(draft.linkedScheduleIds),
    severity: draft.severity,
    internalResponsibleUserId: draft.internalResponsibleUserId || null,
    regularizationDeadline: draft.regularizationDeadline || null,
    conclusion: draft.conclusion.trim() || null,
    evidenceNotes: draft.evidenceNotes.trim() || null
  };
}

function OccurrenceFormFields({
  draft,
  onChange,
  disabled
}: {
  draft: OccurrenceDraft;
  onChange: (next: OccurrenceDraft) => void;
  disabled?: boolean;
}): JSX.Element {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Label className="space-y-1 text-xs">
        <span>Tipo</span>
        <select
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={draft.type}
          disabled={disabled}
          onChange={(e) => onChange({ ...draft, type: e.target.value as ContractOccurrenceType })}
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Label>
      <Label className="space-y-1 text-xs">
        <span>Origem</span>
        <select
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={draft.origin}
          disabled={disabled}
          onChange={(e) => onChange({ ...draft, origin: e.target.value as ContractOccurrenceOrigin })}
        >
          {ORIGIN_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Label>
      <Label className="space-y-1 text-xs md:col-span-2">
        <span>Título</span>
        <Input
          value={draft.title}
          disabled={disabled}
          onChange={(e) => onChange({ ...draft, title: e.target.value })}
          placeholder="Resumo da ocorrência"
        />
      </Label>
      <Label className="space-y-1 text-xs md:col-span-2">
        <span>Descrição</span>
        <Textarea
          value={draft.description}
          disabled={disabled}
          onChange={(e) => onChange({ ...draft, description: e.target.value })}
          rows={3}
        />
      </Label>
      <Label className="space-y-1 text-xs">
        <span>Data da constatação</span>
        <Input
          type="date"
          value={draft.detectionDate}
          disabled={disabled}
          onChange={(e) => onChange({ ...draft, detectionDate: e.target.value })}
        />
      </Label>
      <Label className="space-y-1 text-xs">
        <span>Prazo de regularização</span>
        <Input
          type="date"
          value={draft.regularizationDeadline}
          disabled={disabled}
          onChange={(e) => onChange({ ...draft, regularizationDeadline: e.target.value })}
        />
      </Label>
      <Label className="space-y-1 text-xs">
        <span>Gravidade</span>
        <select
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={draft.severity}
          disabled={disabled}
          onChange={(e) => onChange({ ...draft, severity: e.target.value as ContractOccurrenceSeverity })}
        >
          {SEVERITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Label>
      <div className="space-y-1 text-xs">
        <span className="font-medium">Responsável interno</span>
        <UserSelect
          value={draft.internalResponsibleUserId}
          onChange={(id) => onChange({ ...draft, internalResponsibleUserId: id })}
          disabled={disabled}
          placeholder="Selecionar usuário"
        />
      </div>
      <Label className="space-y-1 text-xs md:col-span-2">
        <span>Vínculos opcionais (IDs separados por vírgula)</span>
        <div className="grid gap-2 md:grid-cols-2">
          <Input
            value={draft.linkedPricingItemIds}
            disabled={disabled}
            onChange={(e) => onChange({ ...draft, linkedPricingItemIds: e.target.value })}
            placeholder="Itens contratuais"
          />
          <Input
            value={draft.linkedFeatureIds}
            disabled={disabled}
            onChange={(e) => onChange({ ...draft, linkedFeatureIds: e.target.value })}
            placeholder="Funcionalidades"
          />
          <Input
            value={draft.linkedMeasurementIds}
            disabled={disabled}
            onChange={(e) => onChange({ ...draft, linkedMeasurementIds: e.target.value })}
            placeholder="Medições"
          />
          <Input
            value={draft.linkedGlosaIds}
            disabled={disabled}
            onChange={(e) => onChange({ ...draft, linkedGlosaIds: e.target.value })}
            placeholder="Glosas"
          />
          <Input
            className="md:col-span-2"
            value={draft.linkedScheduleIds}
            disabled={disabled}
            onChange={(e) => onChange({ ...draft, linkedScheduleIds: e.target.value })}
            placeholder="Cronogramas"
          />
        </div>
      </Label>
      <Label className="space-y-1 text-xs md:col-span-2">
        <span>Evidências / observações</span>
        <Textarea
          value={draft.evidenceNotes}
          disabled={disabled}
          onChange={(e) => onChange({ ...draft, evidenceNotes: e.target.value })}
          rows={2}
          placeholder="Referências a documentos, e-mails, links ou anotações (anexos em versão futura)"
        />
      </Label>
      <Label className="space-y-1 text-xs md:col-span-2">
        <span>Conclusão</span>
        <Textarea
          value={draft.conclusion}
          disabled={disabled}
          onChange={(e) => onChange({ ...draft, conclusion: e.target.value })}
          rows={2}
        />
      </Label>
    </div>
  );
}

export function ContractOccurrencesPanel({ contract }: Props): JSX.Element {
  const router = useRouter();
  const occurrences = contract.occurrences ?? [];
  const cases = contract.controladoriaCases ?? [];
  const [draft, setDraft] = useState<OccurrenceDraft>(emptyDraft);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<OccurrenceDraft>(emptyDraft);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusDraft, setStatusDraft] = useState<{ status: ContractOccurrenceStatus; justification: string }>({
    status: "EM_ANALISE",
    justification: ""
  });
  const [forwardDraft, setForwardDraft] = useState({
    justification: "",
    summary: "",
    suggestedActions: ""
  });
  const [caseEditId, setCaseEditId] = useState<string | null>(null);
  const [caseDraft, setCaseDraft] = useState<UpdateContractControladoriaCasePayload>({});

  const { data: permissions } = useQuery({
    queryKey: queryKeys.myPermissions,
    queryFn: getMyPermissions,
    staleTime: 10 * 60_000
  });
  const permissionKeys = permissions?.keys ?? [];
  const canEdit = permissionKeys.includes("contracts.edit");
  const canForward =
    permissionKeys.includes("controladoria.manage") ||
    (permissions?.role === "ADMIN" && permissionKeys.includes("contracts.edit"));

  const refresh = () => router.refresh();

  const createMut = useMutation({
    mutationFn: () => createContractOccurrence(contract.id, draftToPayload(draft)),
    onSuccess: () => {
      toast.success("Ocorrência registrada.");
      setDraft(emptyDraft());
      setShowCreate(false);
      refresh();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao criar ocorrência.")
  });

  const updateMut = useMutation({
    mutationFn: () => {
      if (!editingId) throw new Error("Ocorrência não selecionada.");
      return updateContractOccurrence(contract.id, editingId, draftToPayload(editDraft));
    },
    onSuccess: () => {
      toast.success("Ocorrência atualizada.");
      setEditingId(null);
      refresh();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao atualizar ocorrência.")
  });

  const statusMut = useMutation({
    mutationFn: (occurrenceId: string) =>
      changeContractOccurrenceStatus(contract.id, occurrenceId, {
        status: statusDraft.status,
        justification: statusDraft.justification.trim()
      }),
    onSuccess: () => {
      toast.success("Situação atualizada.");
      setStatusDraft((s) => ({ ...s, justification: "" }));
      refresh();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao alterar situação.")
  });

  const deleteMut = useMutation({
    mutationFn: (occurrenceId: string) => deleteContractOccurrence(contract.id, occurrenceId),
    onSuccess: () => {
      toast.success("Ocorrência excluída.");
      refresh();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao excluir ocorrência.")
  });

  const forwardMut = useMutation({
    mutationFn: (occurrenceId: string) =>
      forwardOccurrenceToControladoria(contract.id, occurrenceId, {
        justification: forwardDraft.justification.trim(),
        summary: forwardDraft.summary.trim(),
        suggestedActions: forwardDraft.suggestedActions.trim() || null
      }),
    onSuccess: () => {
      toast.success("Ocorrência encaminhada à Controladoria.");
      setForwardDraft({ justification: "", summary: "", suggestedActions: "" });
      refresh();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao encaminhar.")
  });

  const caseMut = useMutation({
    mutationFn: () => {
      if (!caseEditId) throw new Error("Caso não selecionado.");
      return updateContractControladoriaCase(contract.id, caseEditId, caseDraft);
    },
    onSuccess: () => {
      toast.success("Caso da Controladoria atualizado.");
      setCaseEditId(null);
      setCaseDraft({});
      refresh();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao atualizar caso.")
  });

  const busy =
    createMut.isPending ||
    updateMut.isPending ||
    statusMut.isPending ||
    deleteMut.isPending ||
    forwardMut.isPending ||
    caseMut.isPending;

  const sorted = useMemo(
    () =>
      [...occurrences].sort((a, b) => String(b.detectionDate).localeCompare(String(a.detectionDate))),
    [occurrences]
  );

  function startEdit(o: ContractOccurrence): void {
    setEditingId(o.id);
    setEditDraft(fromOccurrence(o));
    setExpandedId(o.id);
    setStatusDraft({ status: o.status, justification: "" });
  }

  function startCaseEdit(c: ContractControladoriaCase): void {
    setCaseEditId(c.id);
    setCaseDraft({
      status: c.status,
      processNumber: c.processNumber ?? "",
      originSystem: c.originSystem ?? "",
      processLink: c.processLink ?? "",
      openedAt: toDateInput(c.openedAt),
      subject: c.subject ?? "",
      unit: c.unit ?? "",
      responsiblesText: c.responsiblesText ?? "",
      phase: c.phase ?? "",
      deadlinesText: c.deadlinesText ?? "",
      decisionsText: c.decisionsText ?? "",
      penaltiesText: c.penaltiesText ?? "",
      resultText: c.resultText ?? "",
      seiNumber: c.seiNumber ?? "",
      seiLink: c.seiLink ?? ""
    });
  }

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Ocorrências</h2>
        <p className="mt-1 text-sm text-slate-600">
          Registre não conformidades, atrasos e demais fatos do contrato com histórico de situações. Não há
          notificação automática nesta versão. Evidências ficam em texto; anexos entram em onda futura.
        </p>
      </div>

      {canEdit ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-800">Nova ocorrência</p>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowCreate((v) => !v)}>
              {showCreate ? "Ocultar" : "Registrar"}
            </Button>
          </div>
          {showCreate ? (
            <div className="mt-3 space-y-3">
              <OccurrenceFormFields draft={draft} onChange={setDraft} disabled={busy} />
              <Button
                type="button"
                disabled={busy || !draft.title.trim() || !draft.detectionDate}
                onClick={() => createMut.mutate()}
              >
                Salvar ocorrência
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {sorted.length === 0 ? (
        <p className="text-sm text-slate-600">Nenhuma ocorrência registrada neste contrato.</p>
      ) : (
        <ul className="space-y-3">
          {sorted.map((o) => {
            const open = expandedId === o.id;
            return (
              <li key={o.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">{o.title}</p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      {labelOf(TYPE_OPTIONS, o.type)} · {labelOf(ORIGIN_OPTIONS, o.origin)} ·{" "}
                      {labelOf(SEVERITY_OPTIONS, o.severity)} · Constatação {formatDateBr(o.detectionDate)}
                    </p>
                    <p className="mt-1 text-xs font-medium text-slate-700">
                      Situação: {labelOf(STATUS_OPTIONS, o.status)}
                      {o.internalResponsible?.name
                        ? ` · Responsável: ${o.internalResponsible.name}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setExpandedId(open ? null : o.id)}
                    >
                      {open ? "Recolher" : "Detalhes"}
                    </Button>
                    {canEdit ? (
                      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => startEdit(o)}>
                        Editar
                      </Button>
                    ) : null}
                  </div>
                </div>

                {open ? (
                  <div className="mt-3 space-y-4 border-t border-slate-100 pt-3">
                    {o.description ? <p className="text-sm text-slate-700 whitespace-pre-wrap">{o.description}</p> : null}
                    {o.evidenceNotes ? (
                      <p className="text-sm text-slate-600">
                        <span className="font-medium text-slate-800">Evidências: </span>
                        {o.evidenceNotes}
                      </p>
                    ) : null}
                    {o.conclusion ? (
                      <p className="text-sm text-slate-600">
                        <span className="font-medium text-slate-800">Conclusão: </span>
                        {o.conclusion}
                      </p>
                    ) : null}

                    {editingId === o.id ? (
                      <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50/80 p-3">
                        <p className="text-sm font-medium">Editar ocorrência</p>
                        <OccurrenceFormFields draft={editDraft} onChange={setEditDraft} disabled={busy} />
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" disabled={busy} onClick={() => updateMut.mutate()}>
                            Salvar alterações
                          </Button>
                          <Button type="button" variant="outline" disabled={busy} onClick={() => setEditingId(null)}>
                            Cancelar
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="text-red-700"
                            disabled={busy}
                            onClick={() => {
                              if (confirm("Excluir esta ocorrência? Só é permitido se não houver dossiê na Controladoria.")) {
                                deleteMut.mutate(o.id);
                              }
                            }}
                          >
                            Excluir
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    {canEdit ? (
                      <div className="space-y-2 rounded-md border border-slate-200 p-3">
                        <p className="text-sm font-medium">Mudar situação</p>
                        <div className="grid gap-2 md:grid-cols-2">
                          <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                            value={statusDraft.status}
                            disabled={busy}
                            onChange={(e) =>
                              setStatusDraft((s) => ({
                                ...s,
                                status: e.target.value as ContractOccurrenceStatus
                              }))
                            }
                          >
                            {STATUS_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          <Input
                            value={statusDraft.justification}
                            disabled={busy}
                            onChange={(e) => setStatusDraft((s) => ({ ...s, justification: e.target.value }))}
                            placeholder="Justificativa obrigatória"
                          />
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy || statusDraft.justification.trim().length < 3}
                          onClick={() => statusMut.mutate(o.id)}
                        >
                          Aplicar situação
                        </Button>
                      </div>
                    ) : null}

                    {canForward ? (
                      <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50/50 p-3">
                        <p className="text-sm font-medium text-slate-900">Encaminhar à Controladoria</p>
                        <p className="text-xs text-slate-600">
                          Gera um dossiê consolidado sem apagar a ocorrência. Exige justificativa, resumo e,
                          opcionalmente, providências sugeridas.
                        </p>
                        <Textarea
                          value={forwardDraft.justification}
                          disabled={busy}
                          onChange={(e) => setForwardDraft((d) => ({ ...d, justification: e.target.value }))}
                          placeholder="Justificativa do encaminhamento"
                          rows={2}
                        />
                        <Textarea
                          value={forwardDraft.summary}
                          disabled={busy}
                          onChange={(e) => setForwardDraft((d) => ({ ...d, summary: e.target.value }))}
                          placeholder="Resumo do caso"
                          rows={2}
                        />
                        <Textarea
                          value={forwardDraft.suggestedActions}
                          disabled={busy}
                          onChange={(e) => setForwardDraft((d) => ({ ...d, suggestedActions: e.target.value }))}
                          placeholder="Providências sugeridas (opcional)"
                          rows={2}
                        />
                        <Button
                          type="button"
                          size="sm"
                          disabled={
                            busy ||
                            forwardDraft.justification.trim().length < 3 ||
                            forwardDraft.summary.trim().length < 3
                          }
                          onClick={() => forwardMut.mutate(o.id)}
                        >
                          Encaminhar
                        </Button>
                      </div>
                    ) : null}

                    <div>
                      <p className="text-sm font-medium text-slate-800">Linha do tempo</p>
                      {(o.events ?? []).length === 0 ? (
                        <p className="mt-1 text-xs text-slate-500">Sem eventos registrados.</p>
                      ) : (
                        <ul className="mt-2 space-y-1.5">
                          {(o.events ?? []).map((ev) => (
                            <li key={ev.id} className="rounded border border-slate-100 bg-slate-50 px-2 py-1.5 text-xs text-slate-700">
                              <span className="font-medium">{ev.eventType}</span>
                              {ev.fromStatus || ev.toStatus
                                ? ` · ${ev.fromStatus ? labelOf(STATUS_OPTIONS, ev.fromStatus) : "-"} → ${
                                    ev.toStatus ? labelOf(STATUS_OPTIONS, ev.toStatus) : "-"
                                  }`
                                : ""}
                              {ev.actorLabel ? ` · ${ev.actorLabel}` : ""}
                              {ev.createdAt ? ` · ${formatDateBr(ev.createdAt)}` : ""}
                              {ev.justification ? (
                                <span className="mt-0.5 block text-slate-600">{ev.justification}</span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <div className="border-t border-slate-100 pt-4">
        <h3 className="text-base font-semibold text-slate-900">Casos na Controladoria</h3>
        <p className="mt-1 text-sm text-slate-600">
          Dossiês gerados a partir de ocorrências. Acompanhe número do processo, fase, prazos, decisões e campos
          preparados para SEI.
        </p>
        {cases.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">Nenhum caso encaminhado neste contrato.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {cases.map((c) => (
              <li key={c.id} className={cn("rounded-lg border border-slate-200 p-3")}>
                <p className="text-sm font-medium text-slate-900">
                  {c.occurrence?.title ?? "Ocorrência"} · {labelOf(CASE_STATUS_OPTIONS, c.status)}
                </p>
                <p className="mt-1 text-xs text-slate-600 line-clamp-2">{c.summary}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Processo: {c.processNumber || "-"}
                  {c.seiNumber ? ` · SEI: ${c.seiNumber}` : ""}
                  {c.phase ? ` · Fase: ${c.phase}` : ""}
                </p>
                {canForward ? (
                  <div className="mt-2">
                    {caseEditId === c.id ? (
                      <div className="grid gap-2 md:grid-cols-2">
                        <Label className="space-y-1 text-xs">
                          <span>Situação do caso</span>
                          <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                            value={caseDraft.status ?? c.status}
                            onChange={(e) =>
                              setCaseDraft((d) => ({
                                ...d,
                                status: e.target.value as ContractControladoriaCaseStatus
                              }))
                            }
                          >
                            {CASE_STATUS_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </Label>
                        <Label className="space-y-1 text-xs">
                          <span>Número do processo</span>
                          <Input
                            value={caseDraft.processNumber ?? ""}
                            onChange={(e) => setCaseDraft((d) => ({ ...d, processNumber: e.target.value }))}
                          />
                        </Label>
                        <Label className="space-y-1 text-xs">
                          <span>Sistema de origem</span>
                          <Input
                            value={caseDraft.originSystem ?? ""}
                            onChange={(e) => setCaseDraft((d) => ({ ...d, originSystem: e.target.value }))}
                          />
                        </Label>
                        <Label className="space-y-1 text-xs">
                          <span>Link do processo</span>
                          <Input
                            value={caseDraft.processLink ?? ""}
                            onChange={(e) => setCaseDraft((d) => ({ ...d, processLink: e.target.value }))}
                          />
                        </Label>
                        <Label className="space-y-1 text-xs">
                          <span>Data de abertura</span>
                          <Input
                            type="date"
                            value={caseDraft.openedAt ?? ""}
                            onChange={(e) => setCaseDraft((d) => ({ ...d, openedAt: e.target.value }))}
                          />
                        </Label>
                        <Label className="space-y-1 text-xs">
                          <span>Objeto</span>
                          <Input
                            value={caseDraft.subject ?? ""}
                            onChange={(e) => setCaseDraft((d) => ({ ...d, subject: e.target.value }))}
                          />
                        </Label>
                        <Label className="space-y-1 text-xs">
                          <span>Unidade</span>
                          <Input
                            value={caseDraft.unit ?? ""}
                            onChange={(e) => setCaseDraft((d) => ({ ...d, unit: e.target.value }))}
                          />
                        </Label>
                        <Label className="space-y-1 text-xs">
                          <span>Fase</span>
                          <Input
                            value={caseDraft.phase ?? ""}
                            onChange={(e) => setCaseDraft((d) => ({ ...d, phase: e.target.value }))}
                          />
                        </Label>
                        <Label className="space-y-1 text-xs md:col-span-2">
                          <span>Responsáveis</span>
                          <Input
                            value={caseDraft.responsiblesText ?? ""}
                            onChange={(e) => setCaseDraft((d) => ({ ...d, responsiblesText: e.target.value }))}
                          />
                        </Label>
                        <Label className="space-y-1 text-xs md:col-span-2">
                          <span>Prazos</span>
                          <Textarea
                            rows={2}
                            value={caseDraft.deadlinesText ?? ""}
                            onChange={(e) => setCaseDraft((d) => ({ ...d, deadlinesText: e.target.value }))}
                          />
                        </Label>
                        <Label className="space-y-1 text-xs md:col-span-2">
                          <span>Decisões</span>
                          <Textarea
                            rows={2}
                            value={caseDraft.decisionsText ?? ""}
                            onChange={(e) => setCaseDraft((d) => ({ ...d, decisionsText: e.target.value }))}
                          />
                        </Label>
                        <Label className="space-y-1 text-xs md:col-span-2">
                          <span>Penalidades</span>
                          <Textarea
                            rows={2}
                            value={caseDraft.penaltiesText ?? ""}
                            onChange={(e) => setCaseDraft((d) => ({ ...d, penaltiesText: e.target.value }))}
                          />
                        </Label>
                        <Label className="space-y-1 text-xs md:col-span-2">
                          <span>Resultado</span>
                          <Textarea
                            rows={2}
                            value={caseDraft.resultText ?? ""}
                            onChange={(e) => setCaseDraft((d) => ({ ...d, resultText: e.target.value }))}
                          />
                        </Label>
                        <Label className="space-y-1 text-xs">
                          <span>SEI (número)</span>
                          <Input
                            value={caseDraft.seiNumber ?? ""}
                            onChange={(e) => setCaseDraft((d) => ({ ...d, seiNumber: e.target.value }))}
                          />
                        </Label>
                        <Label className="space-y-1 text-xs">
                          <span>SEI (link)</span>
                          <Input
                            value={caseDraft.seiLink ?? ""}
                            onChange={(e) => setCaseDraft((d) => ({ ...d, seiLink: e.target.value }))}
                          />
                        </Label>
                        <div className="flex flex-wrap gap-2 md:col-span-2">
                          <Button type="button" size="sm" disabled={busy} onClick={() => caseMut.mutate()}>
                            Salvar acompanhamento
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => {
                              setCaseEditId(null);
                              setCaseDraft({});
                            }}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button type="button" size="sm" variant="outline" onClick={() => startCaseEdit(c)}>
                        Atualizar acompanhamento
                      </Button>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
