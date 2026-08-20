"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  createContractConsumptionMovement,
  getContractConsumptionMovements,
  getContractConsumptions,
  reverseContractConsumptionMovement,
  validateContractConsumptionMovement,
  type ContractConsumptionSummaryItem
} from "@/lib/api";
import { formatPercent } from "@/lib/format-brl";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InlineLoading } from "@/components/ui/inline-loading";

const FINANCIAL_RULE_LABEL: Record<string, string> = {
  INCLUDED_IN_MONTHLY: "Incluído na mensalidade",
  BILLED_BY_CONSUMPTION: "Faturado conforme consumo",
  CONTRACTED_BY_QUANTITY: "Valor contratado por quantidade",
  BALANCE_ONLY: "Somente controle de saldo"
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Rascunho",
  INFORMED: "Informado",
  UNDER_VALIDATION: "Em validação",
  APPROVED: "Aprovado",
  REJECTED: "Rejeitado",
  ADJUSTED: "Ajustado",
  REVERSED: "Estornado"
};

const ACTIVITY_LABEL: Record<string, string> = {
  SURVEY: "Em levantamento",
  AWAITING_APPROVAL: "Aguardando aprovação",
  APPROVED_FOR_EXECUTION: "Aprovado para execução",
  IN_DEVELOPMENT: "Em desenvolvimento",
  IN_VALIDATION: "Em validação",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
  SUSPENDED: "Suspenso"
};

type Props = {
  contractId: string;
  canEdit?: boolean;
};

export function ContractConsumptionsPanel({ contractId, canEdit = false }: Props): JSX.Element {
  const qc = useQueryClient();
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [showForm, setShowForm] = useState(false);
  const [estimatedQuantity, setEstimatedQuantity] = useState("");
  const [quantity, setQuantity] = useState("");
  const [activityStatus, setActivityStatus] = useState("IN_DEVELOPMENT");
  const [executionDate, setExecutionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [responsibleLabel, setResponsibleLabel] = useState("");

  const summaryQuery = useQuery({
    queryKey: queryKeys.contractConsumptions(contractId),
    queryFn: () => getContractConsumptions(contractId),
    meta: { local: true }
  });

  const movementsQuery = useQuery({
    queryKey: queryKeys.contractConsumptionMovements(contractId, selectedItemId || "all"),
    queryFn: () =>
      getContractConsumptionMovements(contractId, {
        pricingItemId: selectedItemId || undefined,
        pageSize: 50
      }),
    meta: { local: true }
  });

  const items = summaryQuery.data?.items ?? [];
  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedItemId) ?? null,
    [items, selectedItemId]
  );

  const unitSuffix = selectedItem?.unit?.label ?? selectedItem?.unit?.code ?? "";

  const createMutation = useMutation({
    mutationFn: () =>
      createContractConsumptionMovement(contractId, {
        pricingItemId: selectedItemId,
        estimatedQuantity: estimatedQuantity
          ? Number(estimatedQuantity.replace(",", "."))
          : 0,
        quantity: quantity ? Number(quantity.replace(",", ".")) : 0,
        activityStatus: activityStatus as never,
        executionDate,
        description: description || null,
        notes: notes || null,
        responsibleLabel: responsibleLabel || null,
        submitForValidation: Boolean(selectedItem?.requiresValidation)
      }),
    onSuccess: async () => {
      toast.success("Consumo registrado.");
      setShowForm(false);
      setEstimatedQuantity("");
      setQuantity("");
      setDescription("");
      setNotes("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.contractConsumptions(contractId) }),
        qc.invalidateQueries({ queryKey: queryKeys.contractConsumptionMovementsRoot(contractId) })
      ]);
    },
    onError: (err: Error) => toast.error(err.message || "Falha ao registrar consumo.")
  });

  const validateMutation = useMutation({
    mutationFn: (input: { id: string; action: "approve" | "reject" | "adjust"; quantity?: number }) =>
      validateContractConsumptionMovement(contractId, input.id, {
        action: input.action,
        quantity: input.quantity,
        justification: input.action === "adjust" ? "Ajuste na validação" : null,
        rejectionReason: input.action === "reject" ? "Rejeitado na validação" : null
      }),
    onSuccess: async () => {
      toast.success("Validação registrada.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.contractConsumptions(contractId) }),
        qc.invalidateQueries({ queryKey: queryKeys.contractConsumptionMovementsRoot(contractId) })
      ]);
    },
    onError: (err: Error) => toast.error(err.message || "Falha na validação.")
  });

  const reverseMutation = useMutation({
    mutationFn: (id: string) => reverseContractConsumptionMovement(contractId, id, { justification: "Estorno" }),
    onSuccess: async () => {
      toast.success("Consumo estornado.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.contractConsumptions(contractId) }),
        qc.invalidateQueries({ queryKey: queryKeys.contractConsumptionMovementsRoot(contractId) })
      ]);
    },
    onError: (err: Error) => toast.error(err.message || "Falha ao estornar.")
  });

  function alertClass(item: ContractConsumptionSummaryItem): string {
    if (item.alertLevel != null && item.alertLevel >= 90) return "border-rose-300 bg-rose-50";
    if (item.alertLevel != null && item.alertLevel >= 70) return "border-amber-300 bg-amber-50";
    return "border-slate-200 bg-white";
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Consumos</h2>
            <p className="mt-1 text-sm text-slate-600">
              Acompanhamento de itens controlados por quantidade (horas, UST, visitas e demais unidades do contrato).
            </p>
          </div>
          {summaryQuery.isFetching ? <InlineLoading label="Atualizando..." /> : null}
        </div>

        {summaryQuery.isLoading ? (
          <p className="mt-4 text-sm text-slate-600">
            <InlineLoading label="Carregando consumos..." />
          </p>
        ) : items.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">
            Nenhum item configurado para controle de consumo neste contrato. Marque itens sob demanda ou com tipo de
            consumo no cadastro financeiro.
          </p>
        ) : (
          <div className="mt-4 grid gap-3">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedItemId(item.id === selectedItemId ? "" : item.id)}
                className={`rounded-lg border p-4 text-left transition ${alertClass(item)} ${
                  selectedItemId === item.id ? "ring-2 ring-slate-400" : ""
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">
                      #{item.sequence} · {item.description}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      {item.configurationPending
                        ? "Controle de consumo pendente de configuração"
                        : `${item.unit?.label ?? "—"} · ${FINANCIAL_RULE_LABEL[item.financialRule] ?? item.financialRule}`}
                      {item.requiresValidation ? " · exige validação" : ""}
                    </p>
                  </div>
                  {!item.configurationPending ? (
                    <p className="text-sm font-semibold tabular-nums text-slate-900">
                      {formatPercent(item.consumedPercent, 2)} consumido
                    </p>
                  ) : null}
                </div>
                {item.configurationPending ? (
                  <p className="mt-3 text-xs text-amber-800">
                    Informe a unidade de consumo e a quantidade disponível no cadastro do contrato.
                    A quantidade financeira do item não é usada como saldo.
                  </p>
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-700 sm:grid-cols-3 lg:grid-cols-6">
                    <div>
                      <p className="text-slate-500">Disponível</p>
                      <p className="font-medium tabular-nums">
                        {item.quantityAvailableBase ?? item.quantityContracted}{" "}
                        {item.unit?.label ?? ""}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Utilizado</p>
                      <p className="font-medium tabular-nums">{item.quantityApprovedUsed}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Em validação</p>
                      <p className="font-medium tabular-nums">{item.quantityPendingValidation}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Estimado em aberto</p>
                      <p className="font-medium tabular-nums">{item.quantityEstimatedOpen ?? "0"}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Saldo efetivo</p>
                      <p className="font-medium tabular-nums">{item.quantityAvailable}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Saldo projetado</p>
                      <p className="font-medium tabular-nums text-slate-600">
                        {item.quantityProjectedAvailable ?? item.quantityAvailable}
                      </p>
                      <p className="text-[10px] text-slate-400">projeção (não contratual)</p>
                    </div>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900">
            Movimentações{selectedItem ? ` · ${selectedItem.description}` : ""}
          </h3>
          {canEdit && selectedItem && !selectedItem.configurationPending ? (
            <Button
              type="button"
              size="sm"
              disabled={createMutation.isPending}
              onClick={() => setShowForm((v) => !v)}
            >
              {showForm ? "Cancelar" : "Registrar consumo"}
            </Button>
          ) : null}
        </div>

        {showForm && selectedItem ? (
          <div className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
            <div>
              <Label>Quantidade estimada ({unitSuffix || "un."})</Label>
              <Input
                className="mt-1"
                value={estimatedQuantity}
                onChange={(e) => setEstimatedQuantity(e.target.value)}
                placeholder="Planejamento — não reduz saldo"
              />
            </div>
            <div>
              <Label>Quantidade efetivamente consumida ({unitSuffix || "un."})</Label>
              <Input
                className="mt-1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Reduz saldo após validação"
              />
            </div>
            <div>
              <Label>Situação da atividade</Label>
              <select
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={activityStatus}
                onChange={(e) => setActivityStatus(e.target.value)}
              >
                {Object.entries(ACTIVITY_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Data de execução / referência</Label>
              <Input
                className="mt-1"
                type="date"
                value={executionDate}
                onChange={(e) => setExecutionDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Responsável</Label>
              <Input
                className="mt-1"
                value={responsibleLabel}
                onChange={(e) => setResponsibleLabel(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Descrição da atividade</Label>
              <Textarea
                className="mt-1"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Observação</Label>
              <Textarea className="mt-1" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Button
                type="button"
                size="sm"
                disabled={createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? <InlineLoading label="Salvando..." /> : "Confirmar lançamento"}
              </Button>
            </div>
          </div>
        ) : null}

        {movementsQuery.isLoading ? (
          <p className="mt-4 text-sm text-slate-600">
            <InlineLoading label="Carregando movimentações..." />
          </p>
        ) : (movementsQuery.data?.items.length ?? 0) === 0 ? (
          <p className="mt-4 text-sm text-slate-600">Nenhuma movimentação encontrada.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-2 py-2">Data</th>
                  <th className="px-2 py-2">Item</th>
                  <th className="px-2 py-2">Estimado</th>
                  <th className="px-2 py-2">Efetivo</th>
                  <th className="px-2 py-2">Atividade</th>
                  <th className="px-2 py-2">Validação</th>
                  <th className="px-2 py-2">GLPI</th>
                  <th className="px-2 py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {movementsQuery.data?.items.map((m) => (
                  <tr key={m.id} className="border-b border-slate-100">
                    <td className="px-2 py-2 tabular-nums">
                      {new Date(m.executionDate).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-2 py-2">{m.pricingItem?.description ?? m.pricingItemId}</td>
                    <td className="px-2 py-2 tabular-nums">
                      {m.estimatedQuantity ?? "0"} {m.unitLabelSnapshot ?? ""}
                    </td>
                    <td className="px-2 py-2 tabular-nums">
                      {m.quantity} {m.unitLabelSnapshot ?? m.pricingItem?.unit?.label ?? ""}
                    </td>
                    <td className="px-2 py-2">
                      {ACTIVITY_LABEL[m.activityStatus ?? ""] ?? m.activityStatus ?? "—"}
                    </td>
                    <td className="px-2 py-2">{STATUS_LABEL[m.status] ?? m.status}</td>
                    <td className="px-2 py-2 tabular-nums">{m.glpiTicketId ?? "—"}</td>
                    <td className="px-2 py-2">
                      {canEdit && (m.status === "UNDER_VALIDATION" || m.status === "INFORMED") ? (
                        <div className="flex flex-wrap gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={validateMutation.isPending}
                            onClick={() => validateMutation.mutate({ id: m.id, action: "approve" })}
                          >
                            Aprovar
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={validateMutation.isPending}
                            onClick={() => validateMutation.mutate({ id: m.id, action: "reject" })}
                          >
                            Rejeitar
                          </Button>
                        </div>
                      ) : null}
                      {canEdit && (m.status === "APPROVED" || m.status === "ADJUSTED") && !m.measurementId ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={reverseMutation.isPending}
                          onClick={() => reverseMutation.mutate(m.id)}
                        >
                          Estornar
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
