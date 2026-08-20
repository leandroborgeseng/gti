"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  createContractConsumptionMovement,
  getContractConsumptions,
  getContractGlpiTickets,
  upsertContractGlpiTicketClassification,
  type ContractGlpiGroup,
  type ContractGlpiTicketCategory,
  type ContractGlpiTicketsQuery
} from "@/lib/api";
import { buildGlpiTicketFrontUrl } from "@/lib/glpi-ticket-front-url";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InlineLoading } from "@/components/ui/inline-loading";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  contractId: string;
  glpiGroups: ContractGlpiGroup[];
  /** Quem pode alterar a classificação local (contracts.edit). */
  canEdit?: boolean;
};

type SyncBanner = {
  lastSuccessAt: string | null;
  lastFinishedAt: string | null;
  isRunning: boolean;
  lastError: string | null;
};

const CATEGORY_OPTIONS: Array<{ value: ContractGlpiTicketCategory; label: string }> = [
  { value: "CORRETIVO", label: "Corretivo" },
  { value: "EVOLUTIVO", label: "Evolutivo" },
  { value: "SUPORTE", label: "Suporte" },
  { value: "DESENVOLVIMENTO", label: "Desenvolvimento" },
  { value: "DUVIDA", label: "Dúvida" },
  { value: "INDISPONIBILIDADE", label: "Indisponibilidade" },
  { value: "OUTRO", label: "Outro" }
];

function formatDateTimePtBr(iso: string | null | undefined): string {
  if (!iso?.trim()) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR");
}

function formatGlpiDate(raw: string | null | undefined): string {
  if (!raw?.trim()) return "-";
  const normalized = raw.trim().includes("T") ? raw.trim() : raw.trim().replace(" ", "T");
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("pt-BR");
}

async function fetchGlpiSyncBanner(): Promise<SyncBanner | null> {
  try {
    const res = await fetch("/api/glpi/status", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      ok?: boolean;
      sync?: {
        lastSuccessAt?: string | null;
        lastFinishedAt?: string | null;
        isRunning?: boolean;
        lastError?: string | null;
      };
    };
    if (!data.ok || !data.sync) return null;
    return {
      lastSuccessAt: data.sync.lastSuccessAt ?? null,
      lastFinishedAt: data.sync.lastFinishedAt ?? null,
      isRunning: Boolean(data.sync.isRunning),
      lastError: data.sync.lastError ?? null
    };
  } catch {
    return null;
  }
}

export function ContractGlpiTicketsPanel({ contractId, glpiGroups, canEdit = false }: Props): JSX.Element {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [slaOverdue, setSlaOverdue] = useState(false);
  const [consumeTicketId, setConsumeTicketId] = useState<number | null>(null);
  const [consumeItemId, setConsumeItemId] = useState("");
  const [consumeEstimated, setConsumeEstimated] = useState("");
  const [consumeQty, setConsumeQty] = useState("");
  const [consumeActivityStatus, setConsumeActivityStatus] = useState("IN_DEVELOPMENT");
  const [consumeDate, setConsumeDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [consumeDesc, setConsumeDesc] = useState("");
  const [consumeNotes, setConsumeNotes] = useState("");
  const [consumeResponsible, setConsumeResponsible] = useState("");

  const filters: ContractGlpiTicketsQuery = useMemo(
    () => ({
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(slaOverdue ? { slaOverdue: true } : {})
    }),
    [status, priority, from, to, slaOverdue]
  );

  const filterKey = useMemo(
    () =>
      [status || "-", priority || "-", from || "-", to || "-", slaOverdue ? "1" : "0"].join("|"),
    [status, priority, from, to, slaOverdue]
  );

  const qTickets = useQuery({
    queryKey: queryKeys.contractGlpiTickets(contractId, filterKey),
    queryFn: () => getContractGlpiTickets(contractId, filters)
  });

  const qSync = useQuery({
    queryKey: queryKeys.glpiSyncStatus("contract-panel"),
    queryFn: fetchGlpiSyncBanner,
    staleTime: 60_000
  });

  const classifyMut = useMutation({
    mutationFn: (input: { glpiTicketId: number; category: ContractGlpiTicketCategory }) =>
      upsertContractGlpiTicketClassification(contractId, input.glpiTicketId, {
        category: input.category
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.contractGlpiTickets(contractId, filterKey) });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar a classificação.");
    }
  });

  const qConsumptions = useQuery({
    queryKey: queryKeys.contractConsumptions(contractId),
    queryFn: () => getContractConsumptions(contractId),
    enabled: canEdit && consumeTicketId != null
  });

  const selectedConsumeItem = qConsumptions.data?.items.find((i) => i.id === consumeItemId) ?? null;
  const consumeUnitLabel = selectedConsumeItem?.unit?.label ?? "un.";
  const consumableItems = (qConsumptions.data?.items ?? []).filter((i) => !i.configurationPending);

  const consumeMut = useMutation({
    mutationFn: () => {
      const item = qConsumptions.data?.items.find((i) => i.id === consumeItemId);
      return createContractConsumptionMovement(contractId, {
        pricingItemId: consumeItemId,
        estimatedQuantity: consumeEstimated
          ? Number(consumeEstimated.replace(",", "."))
          : 0,
        quantity: consumeQty ? Number(consumeQty.replace(",", ".")) : 0,
        activityStatus: consumeActivityStatus as never,
        executionDate: consumeDate,
        description: consumeDesc || null,
        notes: consumeNotes || null,
        responsibleLabel: consumeResponsible || null,
        glpiTicketId: consumeTicketId,
        submitForValidation: Boolean(item?.requiresValidation)
      });
    },
    onSuccess: async () => {
      toast.success("Consumo registrado no chamado.");
      setConsumeTicketId(null);
      setConsumeItemId("");
      setConsumeEstimated("");
      setConsumeQty("");
      setConsumeActivityStatus("IN_DEVELOPMENT");
      setConsumeDesc("");
      setConsumeNotes("");
      await qc.invalidateQueries({ queryKey: queryKeys.contractConsumptions(contractId) });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Não foi possível registrar o consumo.");
    }
  });

  const data = qTickets.data;
  const tickets = data?.tickets ?? [];
  const facets = data?.facets;
  const hasGroups =
    (data?.glpiGroupIds.length ?? 0) > 0 || (data == null && glpiGroups.length > 0);
  const sampleGlpiUrl = buildGlpiTicketFrontUrl(1);
  const glpiLinkAvailable = Boolean(sampleGlpiUrl);

  const syncText = useMemo(() => {
    const b = qSync.data;
    if (!b) return null;
    if (b.isRunning) return "Sincronização GLPI em andamento…";
    if (b.lastSuccessAt?.trim()) {
      return `Última sincronização bem-sucedida: ${formatDateTimePtBr(b.lastSuccessAt)}.`;
    }
    if (b.lastFinishedAt?.trim()) {
      return `Última tentativa de sincronização: ${formatDateTimePtBr(b.lastFinishedAt)}.`;
    }
    return "Ainda não há registro de sincronização GLPI.";
  }, [qSync.data]);

  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold text-slate-900">Chamados GLPI</h2>
      <p className="mt-1 text-sm text-slate-600">
        Chamados sincronizados cujos grupos técnicos coincidem com os <strong>Grupos GLPI</strong>{" "}
        vinculados a este contrato. A classificação contratual (coluna local) é gravada no SIGTI e não
        altera o GLPI.
      </p>

      {syncText ? (
        <p className="mt-3 text-xs text-slate-500">
          {syncText}
          {qSync.data?.lastError?.trim() && !qSync.data.isRunning ? (
            <span className="mt-1 block text-amber-800">Último erro de sync: {qSync.data.lastError}</span>
          ) : null}
        </p>
      ) : null}

      {!hasGroups ? (
        <p className="mt-4 text-sm text-slate-600">
          Associe ao menos um grupo na seção <strong>Grupos GLPI</strong> para listar os chamados
          correspondentes.
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5">
              <Label htmlFor="contract-glpi-status">Situação</Label>
              <Select
                value={status || "__all__"}
                onValueChange={(v) => setStatus(v === "__all__" ? "" : v)}
              >
                <SelectTrigger id="contract-glpi-status">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {(facets?.statuses ?? []).map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contract-glpi-priority">Prioridade</Label>
              <Select
                value={priority || "__all__"}
                onValueChange={(v) => setPriority(v === "__all__" ? "" : v)}
              >
                <SelectTrigger id="contract-glpi-priority">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {(facets?.priorities ?? []).map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contract-glpi-from">Abertura de</Label>
              <Input
                id="contract-glpi-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contract-glpi-to">Abertura até</Label>
              <Input
                id="contract-glpi-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={slaOverdue}
                  disabled={facets != null && !facets.slaOverdueAvailable && !slaOverdue}
                  onChange={(e) => setSlaOverdue(e.target.checked)}
                />
                SLA atrasado
                {facets != null && !facets.slaOverdueAvailable ? (
                  <span className="text-xs text-slate-500">(indisponível no cache)</span>
                ) : null}
              </label>
            </div>
          </div>

          {qTickets.isError ? (
            <p className="mt-4 text-sm text-destructive">
              {qTickets.error instanceof Error
                ? qTickets.error.message
                : "Não foi possível carregar os chamados."}
            </p>
          ) : null}

          {qTickets.isPending ? (
            <p className="mt-4 text-sm text-slate-600">Carregando chamados…</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3 font-semibold">Nº</th>
                    <th className="py-2 pr-3 font-semibold">Título</th>
                    <th className="py-2 pr-3 font-semibold">Situação</th>
                    <th className="py-2 pr-3 font-semibold">Prioridade</th>
                    <th className="py-2 pr-3 font-semibold">Classificação</th>
                    <th className="py-2 pr-3 font-semibold">Grupo</th>
                    <th className="py-2 pr-3 font-semibold">Abertura</th>
                    <th className="py-2 pr-3 font-semibold">SLA</th>
                    <th className="py-2 pr-3 font-semibold">GLPI</th>
                    {canEdit ? <th className="py-2 font-semibold">Consumo</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {tickets.length === 0 ? (
                    <tr>
                      <td colSpan={canEdit ? 10 : 9} className="py-4 text-slate-600">
                        Nenhum chamado encontrado para os grupos e filtros atuais.
                      </td>
                    </tr>
                  ) : (
                    tickets.map((t) => {
                      const href = buildGlpiTicketFrontUrl(t.glpiTicketId);
                      const currentCat = t.localClassification?.category ?? "";
                      return (
                        <tr key={t.glpiTicketId} className="border-b border-slate-100 align-top">
                          <td className="py-2 pr-3 font-medium text-slate-900">{t.glpiTicketId}</td>
                          <td className="py-2 pr-3 text-slate-800">
                            <span className="line-clamp-2">{t.title?.trim() || "-"}</span>
                            {t.assignedUserName ? (
                              <span className="mt-0.5 block text-xs text-slate-500">
                                Técnico: {t.assignedUserName}
                              </span>
                            ) : null}
                          </td>
                          <td className="py-2 pr-3 text-slate-700">{t.status?.trim() || "-"}</td>
                          <td className="py-2 pr-3 text-slate-700">{t.priority?.trim() || "-"}</td>
                          <td className="py-2 pr-3">
                            {canEdit ? (
                              <Select
                                value={currentCat || "__none__"}
                                onValueChange={(v) => {
                                  if (v === "__none__") return;
                                  classifyMut.mutate({
                                    glpiTicketId: t.glpiTicketId,
                                    category: v as ContractGlpiTicketCategory
                                  });
                                }}
                                disabled={classifyMut.isPending}
                              >
                                <SelectTrigger className="h-8 w-[160px]">
                                  <SelectValue placeholder="Definir…" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__" disabled>
                                    Definir…
                                  </SelectItem>
                                  {CATEGORY_OPTIONS.map((o) => (
                                    <SelectItem key={o.value} value={o.value}>
                                      {o.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-slate-700">
                                {CATEGORY_OPTIONS.find((o) => o.value === currentCat)?.label || "—"}
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-slate-700">
                            {t.contractGroupName?.trim() ||
                              (t.contractGroupId != null ? `#${t.contractGroupId}` : "-")}
                          </td>
                          <td className="py-2 pr-3 whitespace-nowrap text-slate-700">
                            {formatGlpiDate(t.dateCreation)}
                          </td>
                          <td className="py-2 pr-3 text-slate-700">
                            {t.slaOverdue === true ? (
                              <span className="font-medium text-amber-800">Atrasado</span>
                            ) : t.slaDeadline ? (
                              <span className="text-xs">{formatGlpiDate(t.slaDeadline)}</span>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="py-2">
                            {href ? (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900"
                              >
                                Abrir
                              </a>
                            ) : (
                              <span className="text-xs text-slate-400" title="Defina NEXT_PUBLIC_GLPI_BASE_URL">
                                -
                              </span>
                            )}
                          </td>
                          {canEdit ? (
                            <td className="py-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setConsumeTicketId(t.glpiTicketId);
                                  setConsumeDesc(t.title?.trim() || "");
                                }}
                              >
                                Registrar consumo
                              </Button>
                            </td>
                          ) : null}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
              {consumeTicketId != null ? (
                <div className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Registrar consumo · chamado #{consumeTicketId}
                    </h3>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setConsumeTicketId(null)}>
                      Fechar
                    </Button>
                  </div>
                  {qConsumptions.isLoading ? (
                    <InlineLoading label="Carregando itens de consumo..." />
                  ) : consumableItems.length === 0 ? (
                    <p className="text-sm text-slate-600">
                      Nenhum item de consumo disponível neste contrato. Configure unidade e quantidade de consumo no
                      cadastro do contrato (aba Precificação / itens).
                    </p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label>Item contratual</Label>
                        <Select value={consumeItemId || "__none__"} onValueChange={(v) => setConsumeItemId(v === "__none__" ? "" : v)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o item" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__" disabled>
                              Selecione…
                            </SelectItem>
                            {consumableItems.map((item) => (
                              <SelectItem key={item.id} value={item.id}>
                                #{item.sequence} · {item.description} ({item.unit?.label ?? "un."})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Quantidade estimada ({consumeUnitLabel})</Label>
                        <Input
                          value={consumeEstimated}
                          onChange={(e) => setConsumeEstimated(e.target.value)}
                          inputMode="decimal"
                          placeholder="Planejamento — não reduz saldo"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Quantidade efetivamente consumida ({consumeUnitLabel})</Label>
                        <Input
                          value={consumeQty}
                          onChange={(e) => setConsumeQty(e.target.value)}
                          inputMode="decimal"
                          placeholder="Reduz saldo após validação"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Situação da atividade</Label>
                        <Select value={consumeActivityStatus} onValueChange={setConsumeActivityStatus}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="SURVEY">Em levantamento</SelectItem>
                            <SelectItem value="AWAITING_APPROVAL">Aguardando aprovação</SelectItem>
                            <SelectItem value="APPROVED_FOR_EXECUTION">Aprovado para execução</SelectItem>
                            <SelectItem value="IN_DEVELOPMENT">Em desenvolvimento</SelectItem>
                            <SelectItem value="IN_VALIDATION">Em validação</SelectItem>
                            <SelectItem value="COMPLETED">Concluído</SelectItem>
                            <SelectItem value="CANCELLED">Cancelado</SelectItem>
                            <SelectItem value="SUSPENDED">Suspenso</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Data de execução</Label>
                        <Input type="date" value={consumeDate} onChange={(e) => setConsumeDate(e.target.value)} />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label>Responsável</Label>
                        <Input value={consumeResponsible} onChange={(e) => setConsumeResponsible(e.target.value)} />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label>Descrição da atividade</Label>
                        <Textarea value={consumeDesc} onChange={(e) => setConsumeDesc(e.target.value)} rows={2} />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label>Observação</Label>
                        <Textarea value={consumeNotes} onChange={(e) => setConsumeNotes(e.target.value)} rows={2} />
                      </div>
                      <div className="sm:col-span-2">
                        <Button
                          type="button"
                          disabled={
                            consumeMut.isPending ||
                            !consumeItemId ||
                            (!consumeQty && !consumeEstimated)
                          }
                          onClick={() => consumeMut.mutate()}
                        >
                          {consumeMut.isPending ? <InlineLoading label="Registrando..." /> : "Confirmar consumo"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
              {tickets.length > 0 ? (
                <p className="mt-2 text-xs text-slate-500">
                  Exibindo {tickets.length} chamado{tickets.length === 1 ? "" : "s"}
                  {data && data.total >= 200 ? " (limite da listagem)" : ""}.
                  {!glpiLinkAvailable
                    ? " Link «Abrir» no GLPI exige NEXT_PUBLIC_GLPI_BASE_URL configurada."
                    : null}
                </p>
              ) : null}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
