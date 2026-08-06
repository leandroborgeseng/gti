"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  approveContractSchedule,
  createContractSchedule,
  deleteContractSchedule,
  updateContractSchedule,
  uploadScheduleAttachment,
  type Contract,
  type ContractSchedule,
  type ContractScheduleMilestone,
  type ContractScheduleMilestonePayload,
  type ContractScheduleMilestoneStatus,
  type ContractScheduleOrigin,
  type ContractScheduleStatus,
  type ContractScheduleType,
  type CreateContractSchedulePayload
} from "@/lib/api";
import { GestaoAttachmentsList } from "@/components/attachments/attachment-preview-modal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UserMultiSelect } from "@/components/ui/user-multi-select";
import { cn } from "@/lib/utils";

type Props = {
  contract: Contract;
};

type MilestoneDraft = {
  key: string;
  sequence: number;
  activity: string;
  description: string;
  pricingItemId: string;
  featureId: string;
  plannedStartDate: string;
  plannedEndDate: string;
  actualStartDate: string;
  actualEndDate: string;
  percentComplete: string;
  status: ContractScheduleMilestoneStatus;
  dependencies: string;
  observations: string;
  responsibleUserIds: string[];
};

type ScheduleDraft = {
  name: string;
  type: ContractScheduleType;
  purpose: string;
  origin: ContractScheduleOrigin;
  description: string;
  plannedStartDate: string;
  plannedEndDate: string;
  responsibleUserIds: string[];
  companyResponsibles: string;
  status: ContractScheduleStatus;
  impactaFinanceiro: boolean;
  pricingItemId: string;
  observations: string;
  milestones: MilestoneDraft[];
};

const SCHEDULE_TYPE_OPTIONS: Array<{ value: ContractScheduleType; label: string }> = [
  { value: "IMPLANTACAO", label: "Implantação" },
  { value: "MIGRACAO", label: "Migração" },
  { value: "TREINAMENTO", label: "Treinamento" },
  { value: "ENTREGA_EQUIPAMENTOS", label: "Entrega de equipamentos" },
  { value: "INSTALACAO", label: "Instalação" },
  { value: "INTEGRACAO", label: "Integração" },
  { value: "DESENVOLVIMENTO", label: "Desenvolvimento" },
  { value: "TRANSICAO", label: "Transição" },
  { value: "OPERACAO_ASSISTIDA", label: "Operação assistida" },
  { value: "PLANO_ACAO", label: "Plano de ação" },
  { value: "CORRECAO_PENDENCIAS", label: "Correção de pendências" },
  { value: "ENCERRAMENTO", label: "Encerramento" },
  { value: "OUTRO", label: "Outro" }
];

const SCHEDULE_ORIGIN_OPTIONS: Array<{ value: ContractScheduleOrigin; label: string }> = [
  { value: "TERMO_REFERENCIA", label: "Termo de referência" },
  { value: "PROPOSTA_EMPRESA", label: "Proposta da empresa" },
  { value: "PLANEJAMENTO_INICIAL", label: "Planejamento inicial" },
  { value: "REUNIAO", label: "Reunião" },
  { value: "ADITIVO", label: "Aditivo" },
  { value: "NOTIFICACAO", label: "Notificação" },
  { value: "PLANO_ACAO", label: "Plano de ação" },
  { value: "DETERMINACAO_ADMIN", label: "Determinação administrativa" },
  { value: "OUTRO", label: "Outro" }
];

const SCHEDULE_STATUS_OPTIONS: Array<{ value: ContractScheduleStatus; label: string }> = [
  { value: "RASCUNHO", label: "Rascunho" },
  { value: "ENVIADO_ANALISE", label: "Enviado para análise" },
  { value: "AJUSTES_SOLICITADOS", label: "Ajustes solicitados" },
  { value: "APROVADO", label: "Aprovado" },
  { value: "EM_EXECUCAO", label: "Em execução" },
  { value: "SUSPENSO", label: "Suspenso" },
  { value: "CONCLUIDO", label: "Concluído" },
  { value: "CANCELADO", label: "Cancelado" },
  { value: "SUBSTITUIDO", label: "Substituído" }
];

const MILESTONE_STATUS_OPTIONS: Array<{ value: ContractScheduleMilestoneStatus; label: string }> = [
  { value: "NAO_INICIADA", label: "Não iniciada" },
  { value: "EM_ANDAMENTO", label: "Em andamento" },
  { value: "CONCLUIDA", label: "Concluída" },
  { value: "ATRASADA", label: "Atrasada" },
  { value: "BLOQUEADA", label: "Bloqueada" },
  { value: "CANCELADA", label: "Cancelada" }
];

const DRAFT_STATUSES: ContractScheduleStatus[] = ["RASCUNHO", "ENVIADO_ANALISE", "AJUSTES_SOLICITADOS"];
const APPROVABLE_STATUSES: ContractScheduleStatus[] = ["RASCUNHO", "ENVIADO_ANALISE", "AJUSTES_SOLICITADOS"];
const DELETABLE_STATUSES: ContractScheduleStatus[] = ["RASCUNHO", "CANCELADO"];
const LOCKED_STATUSES: ContractScheduleStatus[] = ["APROVADO", "EM_EXECUCAO", "SUSPENSO"];

function labelOf<T extends string>(options: Array<{ value: T; label: string }>, value: T): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

function toDateInput(value?: string | null): string {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function formatDateBr(value?: string | null): string {
  const raw = toDateInput(value);
  if (!raw) return "—";
  const [y, m, d] = raw.split("-");
  if (!y || !m || !d) return raw;
  return `${d}/${m}/${y}`;
}

function emptyMilestone(sequence: number): MilestoneDraft {
  return {
    key: `m-${Date.now()}-${sequence}`,
    sequence,
    activity: "",
    description: "",
    pricingItemId: "",
    featureId: "",
    plannedStartDate: "",
    plannedEndDate: "",
    actualStartDate: "",
    actualEndDate: "",
    percentComplete: "",
    status: "NAO_INICIADA",
    dependencies: "",
    observations: "",
    responsibleUserIds: []
  };
}

function emptyDraft(): ScheduleDraft {
  return {
    name: "",
    type: "IMPLANTACAO",
    purpose: "",
    origin: "PLANEJAMENTO_INICIAL",
    description: "",
    plannedStartDate: "",
    plannedEndDate: "",
    responsibleUserIds: [],
    companyResponsibles: "",
    status: "RASCUNHO",
    impactaFinanceiro: false,
    pricingItemId: "",
    observations: "",
    milestones: [emptyMilestone(1)]
  };
}

function fromSchedule(schedule: ContractSchedule): ScheduleDraft {
  const milestones =
    schedule.milestones && schedule.milestones.length > 0
      ? schedule.milestones.map((m, idx) => fromMilestone(m, idx + 1))
      : [emptyMilestone(1)];
  return {
    name: schedule.name,
    type: schedule.type,
    purpose: schedule.purpose ?? "",
    origin: schedule.origin,
    description: schedule.description ?? "",
    plannedStartDate: toDateInput(schedule.plannedStartDate),
    plannedEndDate: toDateInput(schedule.plannedEndDate),
    responsibleUserIds: schedule.responsibleUserIds ?? schedule.responsibleUsers?.map((u) => u.id) ?? [],
    companyResponsibles: schedule.companyResponsibles ?? "",
    status: schedule.status,
    impactaFinanceiro: schedule.impactaFinanceiro,
    pricingItemId: schedule.pricingItemId ?? "",
    observations: schedule.observations ?? "",
    milestones
  };
}

function fromMilestone(m: ContractScheduleMilestone, fallbackSequence: number): MilestoneDraft {
  return {
    key: m.id,
    sequence: m.sequence || fallbackSequence,
    activity: m.activity,
    description: m.description ?? "",
    pricingItemId: m.pricingItemId ?? "",
    featureId: m.featureId ?? "",
    plannedStartDate: toDateInput(m.plannedStartDate),
    plannedEndDate: toDateInput(m.plannedEndDate),
    actualStartDate: toDateInput(m.actualStartDate),
    actualEndDate: toDateInput(m.actualEndDate),
    percentComplete: m.percentComplete != null ? String(m.percentComplete) : "",
    status: m.status,
    dependencies: m.dependencies ?? "",
    observations: m.observations ?? "",
    responsibleUserIds: m.responsibleUserIds ?? m.responsibleUsers?.map((u) => u.id) ?? []
  };
}

function toPayload(draft: ScheduleDraft): CreateContractSchedulePayload {
  const milestones: ContractScheduleMilestonePayload[] = draft.milestones
    .filter((m) => m.activity.trim())
    .map((m, idx) => ({
      sequence: m.sequence || idx + 1,
      activity: m.activity.trim(),
      description: m.description.trim() || null,
      pricingItemId: m.pricingItemId || null,
      featureId: m.featureId || null,
      plannedStartDate: m.plannedStartDate || null,
      plannedEndDate: m.plannedEndDate || null,
      actualStartDate: m.actualStartDate || null,
      actualEndDate: m.actualEndDate || null,
      percentComplete: m.percentComplete.trim() === "" ? null : Number(m.percentComplete),
      status: m.status,
      dependencies: m.dependencies.trim() || null,
      observations: m.observations.trim() || null,
      responsibleUserIds: m.responsibleUserIds
    }));

  return {
    name: draft.name.trim(),
    type: draft.type,
    purpose: draft.purpose.trim() || null,
    origin: draft.origin,
    description: draft.description.trim() || null,
    plannedStartDate: draft.plannedStartDate || null,
    plannedEndDate: draft.plannedEndDate || null,
    responsibleUserIds: draft.responsibleUserIds,
    companyResponsibles: draft.companyResponsibles.trim() || null,
    status: draft.status,
    impactaFinanceiro: draft.impactaFinanceiro,
    pricingItemId: draft.pricingItemId || null,
    observations: draft.observations.trim() || null,
    milestones
  };
}

function statusBadgeClass(status: ContractScheduleStatus): string {
  switch (status) {
    case "APROVADO":
    case "EM_EXECUCAO":
      return "bg-emerald-100 text-emerald-900";
    case "RASCUNHO":
    case "ENVIADO_ANALISE":
    case "AJUSTES_SOLICITADOS":
      return "bg-slate-100 text-slate-800";
    case "SUSPENSO":
      return "bg-amber-100 text-amber-900";
    case "CANCELADO":
    case "SUBSTITUIDO":
      return "bg-rose-100 text-rose-900";
    case "CONCLUIDO":
      return "bg-sky-100 text-sky-900";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function SelectNative({
  id,
  value,
  onChange,
  disabled,
  children,
  className
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
    >
      {children}
    </select>
  );
}

function MilestoneEditor({
  milestones,
  onChange,
  pricingOptions,
  featureOptions,
  disabled
}: {
  milestones: MilestoneDraft[];
  onChange: (next: MilestoneDraft[]) => void;
  pricingOptions: Array<{ id: string; label: string }>;
  featureOptions: Array<{ id: string; label: string }>;
  disabled?: boolean;
}): JSX.Element {
  function updateAt(index: number, patch: Partial<MilestoneDraft>): void {
    onChange(milestones.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-800">Etapas / marcos</p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() => onChange([...milestones, emptyMilestone(milestones.length + 1)])}
        >
          Adicionar etapa
        </Button>
      </div>
      {milestones.map((m, index) => (
        <div key={m.key} className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Etapa {index + 1}</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || milestones.length <= 1}
              onClick={() => onChange(milestones.filter((_, i) => i !== index).map((row, i) => ({ ...row, sequence: i + 1 })))}
            >
              Remover
            </Button>
          </div>
          <div className="grid gap-2 md:grid-cols-4">
            <Label className="space-y-1 text-xs">
              <span>Sequência</span>
              <Input
                type="number"
                min={1}
                value={m.sequence}
                disabled={disabled}
                onChange={(e) => updateAt(index, { sequence: Number(e.target.value) || index + 1 })}
              />
            </Label>
            <Label className="space-y-1 text-xs md:col-span-2">
              <span>Atividade</span>
              <Input
                value={m.activity}
                disabled={disabled}
                onChange={(e) => updateAt(index, { activity: e.target.value })}
                placeholder="Ex.: Entrega do ambiente de homologação"
              />
            </Label>
            <Label className="space-y-1 text-xs">
              <span>Situação</span>
              <SelectNative
                value={m.status}
                disabled={disabled}
                onChange={(v) => updateAt(index, { status: v as ContractScheduleMilestoneStatus })}
              >
                {MILESTONE_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </SelectNative>
            </Label>
            <Label className="space-y-1 text-xs md:col-span-2">
              <span>Descrição</span>
              <Input
                value={m.description}
                disabled={disabled}
                onChange={(e) => updateAt(index, { description: e.target.value })}
              />
            </Label>
            <Label className="space-y-1 text-xs">
              <span>% concluído</span>
              <Input
                type="number"
                min={0}
                max={100}
                value={m.percentComplete}
                disabled={disabled}
                onChange={(e) => updateAt(index, { percentComplete: e.target.value })}
              />
            </Label>
            <Label className="space-y-1 text-xs">
              <span>Item contratual (opc.)</span>
              <SelectNative
                value={m.pricingItemId}
                disabled={disabled}
                onChange={(v) => updateAt(index, { pricingItemId: v })}
              >
                <option value="">—</option>
                {pricingOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </SelectNative>
            </Label>
            <Label className="space-y-1 text-xs md:col-span-2">
              <span>Funcionalidade (opc.)</span>
              <SelectNative
                value={m.featureId}
                disabled={disabled}
                onChange={(v) => updateAt(index, { featureId: v })}
              >
                <option value="">—</option>
                {featureOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </SelectNative>
            </Label>
            <Label className="space-y-1 text-xs">
              <span>Início previsto</span>
              <Input
                type="date"
                value={m.plannedStartDate}
                disabled={disabled}
                onChange={(e) => updateAt(index, { plannedStartDate: e.target.value })}
              />
            </Label>
            <Label className="space-y-1 text-xs">
              <span>Fim previsto</span>
              <Input
                type="date"
                value={m.plannedEndDate}
                disabled={disabled}
                onChange={(e) => updateAt(index, { plannedEndDate: e.target.value })}
              />
            </Label>
            <Label className="space-y-1 text-xs">
              <span>Início efetivo</span>
              <Input
                type="date"
                value={m.actualStartDate}
                disabled={disabled}
                onChange={(e) => updateAt(index, { actualStartDate: e.target.value })}
              />
            </Label>
            <Label className="space-y-1 text-xs">
              <span>Fim efetivo</span>
              <Input
                type="date"
                value={m.actualEndDate}
                disabled={disabled}
                onChange={(e) => updateAt(index, { actualEndDate: e.target.value })}
              />
            </Label>
            <Label className="space-y-1 text-xs md:col-span-2">
              <span>Dependências</span>
              <Input
                value={m.dependencies}
                disabled={disabled}
                onChange={(e) => updateAt(index, { dependencies: e.target.value })}
                placeholder="Texto livre ou ids/sequências"
              />
            </Label>
            <Label className="space-y-1 text-xs md:col-span-2">
              <span>Observações da etapa</span>
              <Input
                value={m.observations}
                disabled={disabled}
                onChange={(e) => updateAt(index, { observations: e.target.value })}
              />
            </Label>
          </div>
          <UserMultiSelect
            id={`milestone-resp-${m.key}`}
            label="Responsáveis internos da etapa"
            value={m.responsibleUserIds}
            onChange={(ids) => updateAt(index, { responsibleUserIds: ids })}
            disabled={disabled}
            placeholder="Opcional"
          />
        </div>
      ))}
    </div>
  );
}

function ScheduleFormFields({
  draft,
  onChange,
  pricingOptions,
  featureOptions,
  disabled,
  statusOptions,
  showStatus
}: {
  draft: ScheduleDraft;
  onChange: (next: ScheduleDraft) => void;
  pricingOptions: Array<{ id: string; label: string }>;
  featureOptions: Array<{ id: string; label: string }>;
  disabled?: boolean;
  statusOptions: Array<{ value: ContractScheduleStatus; label: string }>;
  showStatus: boolean;
}): JSX.Element {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <Label className="space-y-1 text-xs md:col-span-2">
          <span>Nome</span>
          <Input
            value={draft.name}
            disabled={disabled}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            placeholder="Ex.: Cronograma de implantação — fase 1"
          />
        </Label>
        <Label className="space-y-1 text-xs">
          <span>Tipo</span>
          <SelectNative
            value={draft.type}
            disabled={disabled}
            onChange={(v) => onChange({ ...draft, type: v as ContractScheduleType })}
          >
            {SCHEDULE_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </SelectNative>
        </Label>
        <Label className="space-y-1 text-xs">
          <span>Origem</span>
          <SelectNative
            value={draft.origin}
            disabled={disabled}
            onChange={(v) => onChange({ ...draft, origin: v as ContractScheduleOrigin })}
          >
            {SCHEDULE_ORIGIN_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </SelectNative>
        </Label>
        {showStatus ? (
          <Label className="space-y-1 text-xs">
            <span>Situação</span>
            <SelectNative
              value={draft.status}
              disabled={disabled}
              onChange={(v) => onChange({ ...draft, status: v as ContractScheduleStatus })}
            >
              {statusOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </SelectNative>
          </Label>
        ) : null}
        <Label className="space-y-1 text-xs">
          <span>Finalidade</span>
          <Input
            value={draft.purpose}
            disabled={disabled}
            onChange={(e) => onChange({ ...draft, purpose: e.target.value })}
            placeholder="Objetivo do cronograma"
          />
        </Label>
        <Label className="space-y-1 text-xs">
          <span>Início previsto</span>
          <Input
            type="date"
            value={draft.plannedStartDate}
            disabled={disabled}
            onChange={(e) => onChange({ ...draft, plannedStartDate: e.target.value })}
          />
        </Label>
        <Label className="space-y-1 text-xs">
          <span>Fim previsto</span>
          <Input
            type="date"
            value={draft.plannedEndDate}
            disabled={disabled}
            onChange={(e) => onChange({ ...draft, plannedEndDate: e.target.value })}
          />
        </Label>
        <Label className="space-y-1 text-xs md:col-span-2">
          <span>Descrição</span>
          <Textarea
            rows={2}
            value={draft.description}
            disabled={disabled}
            onChange={(e) => onChange({ ...draft, description: e.target.value })}
          />
        </Label>
        <Label className="space-y-1 text-xs md:col-span-2">
          <span>Responsáveis da empresa (nomes livres)</span>
          <Input
            value={draft.companyResponsibles}
            disabled={disabled}
            onChange={(e) => onChange({ ...draft, companyResponsibles: e.target.value })}
            placeholder="Ex.: Ana Souza; Equipe de implantação XYZ"
          />
        </Label>
        <Label className="flex items-center gap-2 text-xs md:pt-6">
          <input
            type="checkbox"
            checked={draft.impactaFinanceiro}
            disabled={disabled}
            onChange={(e) => onChange({ ...draft, impactaFinanceiro: e.target.checked })}
          />
          <span>Impacta financeiro</span>
        </Label>
        <Label className="space-y-1 text-xs">
          <span>Item contratual vinculado (opc.)</span>
          <SelectNative
            value={draft.pricingItemId}
            disabled={disabled}
            onChange={(v) => onChange({ ...draft, pricingItemId: v })}
          >
            <option value="">—</option>
            {pricingOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </SelectNative>
        </Label>
        <Label className="space-y-1 text-xs md:col-span-2">
          <span>Observações</span>
          <Textarea
            rows={2}
            value={draft.observations}
            disabled={disabled}
            onChange={(e) => onChange({ ...draft, observations: e.target.value })}
            placeholder="Observações gerais do cronograma"
          />
        </Label>
      </div>
      <UserMultiSelect
        id="schedule-internal-responsibles"
        label="Responsáveis internos"
        value={draft.responsibleUserIds}
        onChange={(ids) => onChange({ ...draft, responsibleUserIds: ids })}
        disabled={disabled}
        placeholder="Selecione um ou mais usuários"
      />
      <MilestoneEditor
        milestones={draft.milestones}
        onChange={(milestones) => onChange({ ...draft, milestones })}
        pricingOptions={pricingOptions}
        featureOptions={featureOptions}
        disabled={disabled}
      />
    </div>
  );
}

function ScheduleAttachmentsBlock(props: {
  contractId: string;
  schedule: ContractSchedule;
  canMutate: boolean;
}): JSX.Element {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const attachments = props.schedule.attachments ?? [];

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !props.canMutate) return;
    setUploading(true);
    try {
      await uploadScheduleAttachment(props.contractId, props.schedule.id, file);
      toast.success("Anexo enviado.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no envio do anexo.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2 border-t border-slate-200 pt-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Anexos</p>
      {props.canMutate ? (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-slate-500">
            PDF, imagens, DOCX, XLSX, ZIP ou TXT. Limite padrão 10 MB.
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
      {attachments.length === 0 && !uploading ? (
        <p className="text-sm text-slate-500">Nenhum anexo neste cronograma.</p>
      ) : attachments.length > 0 ? (
        <GestaoAttachmentsList
          attachments={attachments}
          canMutate={props.canMutate}
          gestaoCtx={{
            scope: "schedule",
            contractId: props.contractId,
            scheduleId: props.schedule.id
          }}
          onDeleted={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}

export function ContractSchedulesPanel({ contract }: Props): JSX.Element {
  const router = useRouter();
  const schedules = contract.schedules ?? [];
  const [createDraft, setCreateDraft] = useState<ScheduleDraft>(emptyDraft);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ScheduleDraft | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const pricingOptions = useMemo(
    () =>
      (contract.pricingItems ?? [])
        .filter((p) => p.status !== "CANCELLED")
        .map((p) => ({
          id: p.id,
          label: `${p.sequence}. ${p.description}`.slice(0, 120)
        })),
    [contract.pricingItems]
  );

  const featureOptions = useMemo(() => {
    const out: Array<{ id: string; label: string }> = [];
    for (const mod of contract.modules ?? []) {
      for (const feat of mod.features ?? []) {
        const code = feat.itemCode?.trim();
        out.push({
          id: feat.id,
          label: `${mod.name} · ${code ? `${code} · ` : ""}${feat.name}`.slice(0, 140)
        });
      }
    }
    return out;
  }, [contract.modules]);

  const createMut = useMutation({
    mutationFn: () => createContractSchedule(contract.id, toPayload(createDraft)),
    onSuccess: () => {
      toast.success("Cronograma criado.");
      setCreateDraft(emptyDraft());
      setShowCreate(false);
      router.refresh();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar o cronograma.");
    }
  });

  const updateMut = useMutation({
    mutationFn: () => {
      if (!editingId || !editDraft) throw new Error("Cronograma não selecionado.");
      return updateContractSchedule(contract.id, editingId, toPayload(editDraft));
    },
    onSuccess: () => {
      toast.success("Cronograma atualizado. Se estava aprovado e houve mudança sensível, uma nova versão foi gerada.");
      setEditingId(null);
      setEditDraft(null);
      router.refresh();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Não foi possível atualizar o cronograma.");
    }
  });

  const approveMut = useMutation({
    mutationFn: (scheduleId: string) => approveContractSchedule(contract.id, scheduleId),
    onSuccess: () => {
      toast.success("Cronograma aprovado (operacional).");
      router.refresh();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Não foi possível aprovar o cronograma.");
    }
  });

  const deleteMut = useMutation({
    mutationFn: (scheduleId: string) => deleteContractSchedule(contract.id, scheduleId),
    onSuccess: () => {
      toast.success("Cronograma excluído.");
      router.refresh();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir o cronograma.");
    }
  });

  const busy =
    createMut.isPending || updateMut.isPending || approveMut.isPending || deleteMut.isPending;

  function startEdit(schedule: ContractSchedule): void {
    setEditingId(schedule.id);
    setEditDraft(fromSchedule(schedule));
    setExpandedId(schedule.id);
  }

  const editStatusOptions = useMemo(() => {
    if (!editDraft) return SCHEDULE_STATUS_OPTIONS;
    if (DRAFT_STATUSES.includes(editDraft.status)) {
      return SCHEDULE_STATUS_OPTIONS.filter((o) =>
        (["RASCUNHO", "ENVIADO_ANALISE", "AJUSTES_SOLICITADOS", "CANCELADO"] as ContractScheduleStatus[]).includes(
          o.value
        )
      );
    }
    if (LOCKED_STATUSES.includes(editDraft.status)) {
      return SCHEDULE_STATUS_OPTIONS.filter((o) =>
        (["APROVADO", "EM_EXECUCAO", "SUSPENSO", "CONCLUIDO", "CANCELADO"] as ContractScheduleStatus[]).includes(
          o.value
        )
      );
    }
    return SCHEDULE_STATUS_OPTIONS.filter((o) => o.value === editDraft.status);
  }, [editDraft]);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Cronogramas e marcos</h2>
          <p className="mt-1 text-sm text-slate-600">
            Planejamento operacional do contrato (implantação, migração, planos de ação etc.), com etapas, responsáveis e
            versionamento após aprovação. Anexos podem ser enviados em cada cronograma expandido.
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? "Fechar formulário" : "Novo cronograma"}
        </Button>
      </div>

      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
        A aprovação de cronograma é <strong>operacional</strong> e <strong>não substitui aditivo</strong> contratual.
        Alterações de datas, etapas ou responsáveis em cronograma já aprovado geram nova versão (a anterior fica como
        «Substituído»).
      </div>

      {showCreate ? (
        <div className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <p className="text-sm font-medium text-slate-800">Novo cronograma</p>
          <ScheduleFormFields
            draft={createDraft}
            onChange={setCreateDraft}
            pricingOptions={pricingOptions}
            featureOptions={featureOptions}
            disabled={busy}
            statusOptions={SCHEDULE_STATUS_OPTIONS.filter((o) => DRAFT_STATUSES.includes(o.value))}
            showStatus
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy || !createDraft.name.trim()}
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending ? "Salvando…" : "Criar cronograma"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setShowCreate(false);
                setCreateDraft(emptyDraft());
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      <ul className="mt-4 space-y-3">
        {schedules.length === 0 ? (
          <li className="text-sm text-slate-600">Nenhum cronograma cadastrado neste contrato.</li>
        ) : (
          schedules.map((schedule) => {
            const isEditing = editingId === schedule.id;
            const isExpanded = expandedId === schedule.id || isEditing;
            const responsibles =
              schedule.responsibleUsers?.map((u) => u.name || u.email).join(", ") || "Sem responsáveis internos";
            return (
              <li
                key={schedule.id}
                className={cn(
                  "rounded-lg border px-3 py-3",
                  schedule.status === "SUBSTITUIDO"
                    ? "border-rose-200 bg-rose-50/40"
                    : "border-slate-200 bg-white"
                )}
              >
                {isEditing && editDraft ? (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-slate-800">
                      Editar · v{schedule.version}
                      {LOCKED_STATUSES.includes(schedule.status)
                        ? " (alterações sensíveis geram nova versão)"
                        : ""}
                    </p>
                    <ScheduleFormFields
                      draft={editDraft}
                      onChange={setEditDraft}
                      pricingOptions={pricingOptions}
                      featureOptions={featureOptions}
                      disabled={busy}
                      statusOptions={editStatusOptions}
                      showStatus
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        disabled={busy || !editDraft.name.trim()}
                        onClick={() => updateMut.mutate()}
                      >
                        {updateMut.isPending ? "Salvando…" : "Salvar"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                          setEditingId(null);
                          setEditDraft(null);
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-slate-900">{schedule.name}</p>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[11px] font-medium",
                              statusBadgeClass(schedule.status)
                            )}
                          >
                            {labelOf(SCHEDULE_STATUS_OPTIONS, schedule.status)}
                          </span>
                          <span className="text-xs text-slate-500">v{schedule.version}</span>
                          {schedule.impactaFinanceiro ? (
                            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-900">
                              Impacta financeiro
                            </span>
                          ) : null}
                        </div>
                        <p className="text-sm text-slate-600">
                          {labelOf(SCHEDULE_TYPE_OPTIONS, schedule.type)} ·{" "}
                          {labelOf(SCHEDULE_ORIGIN_OPTIONS, schedule.origin)}
                          {schedule.purpose ? ` · ${schedule.purpose}` : ""}
                        </p>
                        <p className="text-sm text-slate-700">
                          Previsto: {formatDateBr(schedule.plannedStartDate)} → {formatDateBr(schedule.plannedEndDate)}
                        </p>
                        <p className="text-sm text-slate-700">
                          <span className="font-medium">Internos: </span>
                          {responsibles}
                        </p>
                        {schedule.companyResponsibles ? (
                          <p className="text-sm text-slate-700">
                            <span className="font-medium">Empresa: </span>
                            {schedule.companyResponsibles}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => setExpandedId(isExpanded ? null : schedule.id)}
                        >
                          {isExpanded ? "Ocultar etapas" : `Etapas (${schedule.milestones?.length ?? 0})`}
                        </Button>
                        {schedule.status !== "SUBSTITUIDO" && schedule.status !== "CONCLUIDO" ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={busy}
                            onClick={() => startEdit(schedule)}
                          >
                            Editar
                          </Button>
                        ) : null}
                        {APPROVABLE_STATUSES.includes(schedule.status) ? (
                          <Button
                            type="button"
                            size="sm"
                            disabled={busy}
                            onClick={() => {
                              if (
                                !window.confirm(
                                  "Aprovar este cronograma? A aprovação é operacional e não substitui aditivo."
                                )
                              ) {
                                return;
                              }
                              approveMut.mutate(schedule.id);
                            }}
                          >
                            Aprovar
                          </Button>
                        ) : null}
                        {DELETABLE_STATUSES.includes(schedule.status) ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => {
                              if (!window.confirm(`Excluir o cronograma «${schedule.name}»?`)) return;
                              deleteMut.mutate(schedule.id);
                            }}
                          >
                            Excluir
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    {isExpanded ? (
                      <div className="mt-2 space-y-2 rounded-md border border-slate-100 bg-slate-50/70 p-3">
                        {(schedule.milestones ?? []).length === 0 ? (
                          <p className="text-sm text-slate-600">Sem etapas cadastradas.</p>
                        ) : (
                          <ol className="space-y-2">
                            {(schedule.milestones ?? []).map((m) => (
                              <li key={m.id} className="rounded border border-slate-200 bg-white px-3 py-2 text-sm">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium text-slate-900">
                                    {m.sequence}. {m.activity}
                                  </span>
                                  <span className="text-xs text-slate-500">
                                    {labelOf(MILESTONE_STATUS_OPTIONS, m.status)}
                                    {m.percentComplete != null ? ` · ${m.percentComplete}%` : ""}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-600">
                                  Previsto {formatDateBr(m.plannedStartDate)} → {formatDateBr(m.plannedEndDate)}
                                  {" · "}
                                  Efetivo {formatDateBr(m.actualStartDate)} → {formatDateBr(m.actualEndDate)}
                                </p>
                                {m.dependencies ? (
                                  <p className="text-xs text-slate-600">Dependências: {m.dependencies}</p>
                                ) : null}
                              </li>
                            ))}
                          </ol>
                        )}
                        {schedule.observations ? (
                          <p className="text-sm text-slate-700">
                            <span className="font-medium">Observações: </span>
                            {schedule.observations}
                          </p>
                        ) : null}
                        <ScheduleAttachmentsBlock
                          contractId={contract.id}
                          schedule={schedule}
                          canMutate={schedule.status !== "SUBSTITUIDO" && schedule.status !== "CONCLUIDO"}
                        />
                      </div>
                    ) : null}
                  </div>
                )}
              </li>
            );
          })
        )}
      </ul>
    </Card>
  );
}
