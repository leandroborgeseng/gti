"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  annulFeatureDeliveryEvent,
  getFeatureDeliveryEvents,
  type Contract,
  type ContractFeatureDeliveryEvent,
  type ContractItemDeliveryStatus
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { InlineLoading } from "@/components/ui/inline-loading";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const deliveryLabels: Record<ContractItemDeliveryStatus, string> = {
  NOT_DELIVERED: "Não entregue",
  PARTIALLY_DELIVERED: "Parcialmente entregue",
  DELIVERED: "Entregue"
};

const ANNUL_MIN_REASON = 10;

function formatDateOnly(value: string): string {
  const day = String(value ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return value || "—";
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export type FeatureDeliveryHistoryTarget = {
  contractId: string;
  moduleId: string;
  featureId: string;
  featureName: string;
};

type Props = {
  target: FeatureDeliveryHistoryTarget | null;
  onClose: () => void;
  canAnnul: boolean;
  onAnnulled?: (contract: Contract) => void;
};

export function FeatureDeliveryHistoryModal({
  target,
  onClose,
  canAnnul,
  onAnnulled
}: Props): JSX.Element {
  const qc = useQueryClient();
  const [annulEventId, setAnnulEventId] = useState<string | null>(null);
  const [annulReason, setAnnulReason] = useState("");
  const [annulHint, setAnnulHint] = useState<string | null>(null);

  const eventsQuery = useQuery({
    queryKey: target
      ? queryKeys.featureDeliveryEvents(target.contractId, target.moduleId, target.featureId)
      : ["gestao", "feature-delivery-events", "idle"],
    queryFn: () =>
      getFeatureDeliveryEvents(target!.contractId, target!.moduleId, target!.featureId),
    enabled: target !== null
  });

  const annulMut = useMutation({
    mutationFn: async (vars: { eventId: string; reason: string }) => {
      if (!target) throw new Error("Funcionalidade não selecionada.");
      return annulFeatureDeliveryEvent(
        target.contractId,
        target.moduleId,
        target.featureId,
        vars.eventId,
        vars.reason
      );
    },
    onSuccess: (contract) => {
      if (!target) return;
      toast.success("Evento anulado. O estado vigente foi reconstruído.");
      setAnnulEventId(null);
      setAnnulReason("");
      setAnnulHint(null);
      void qc.invalidateQueries({
        queryKey: queryKeys.featureDeliveryEvents(target.contractId, target.moduleId, target.featureId)
      });
      void qc.invalidateQueries({
        queryKey: queryKeys.moduleFeaturesDelivery(target.contractId, target.moduleId)
      });
      void qc.invalidateQueries({ queryKey: queryKeys.modulesDeliveryOverview });
      void qc.invalidateQueries({ queryKey: queryKeys.contractModulesDelivery(target.contractId) });
      void qc.invalidateQueries({ queryKey: queryKeys.contractStructure(target.contractId) });
      void qc.invalidateQueries({ queryKey: ["gestao", "contract-item-change-logs", target.contractId] });
      void qc.invalidateQueries({ queryKey: queryKeys.modulesDeliverySearchRoot });
      onAnnulled?.(contract);
    },
    onError: (e) => {
      setAnnulHint(e instanceof Error ? e.message : "Não foi possível anular o evento.");
    }
  });

  function close(): void {
    if (annulMut.isPending) return;
    setAnnulEventId(null);
    setAnnulReason("");
    setAnnulHint(null);
    onClose();
  }

  function submitAnnul(): void {
    if (!annulEventId) return;
    const trimmed = annulReason.trim();
    if (trimmed.length < ANNUL_MIN_REASON) {
      setAnnulHint(`Informe uma justificativa com pelo menos ${ANNUL_MIN_REASON} caracteres.`);
      toast.error(`Informe uma justificativa com pelo menos ${ANNUL_MIN_REASON} caracteres.`);
      return;
    }
    setAnnulHint(null);
    annulMut.mutate({ eventId: annulEventId, reason: trimmed });
  }

  const events = eventsQuery.data ?? [];

  return (
    <Modal
      open={target !== null}
      onClose={close}
      title="Histórico de entrega"
      description={
        target
          ? `Registros temporais de «${target.featureName}». Eventos anulados permanecem visíveis e não podem ser editados.`
          : undefined
      }
      contentClassName="max-w-2xl"
    >
      {eventsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">
          <InlineLoading label="Carregando histórico…" />
        </p>
      ) : eventsQuery.isError ? (
        <p className="text-sm text-destructive" role="alert">
          {eventsQuery.error instanceof Error
            ? eventsQuery.error.message
            : "Não foi possível carregar o histórico."}
        </p>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum evento de entrega registrado nesta funcionalidade.</p>
      ) : (
        <ul className="space-y-3">
          {events.map((event) => (
            <HistoryEventCard
              key={event.id}
              event={event}
              canAnnul={canAnnul}
              annulOpen={annulEventId === event.id}
              annulReason={annulReason}
              annulHint={annulHint}
              pending={annulMut.isPending}
              onStartAnnul={() => {
                setAnnulEventId(event.id);
                setAnnulReason("");
                setAnnulHint(null);
              }}
              onCancelAnnul={() => {
                if (annulMut.isPending) return;
                setAnnulEventId(null);
                setAnnulReason("");
                setAnnulHint(null);
              }}
              onReasonChange={setAnnulReason}
              onConfirmAnnul={submitAnnul}
            />
          ))}
        </ul>
      )}
    </Modal>
  );
}

function HistoryEventCard({
  event,
  canAnnul,
  annulOpen,
  annulReason,
  annulHint,
  pending,
  onStartAnnul,
  onCancelAnnul,
  onReasonChange,
  onConfirmAnnul
}: {
  event: ContractFeatureDeliveryEvent;
  canAnnul: boolean;
  annulOpen: boolean;
  annulReason: string;
  annulHint: string | null;
  pending: boolean;
  onStartAnnul: () => void;
  onCancelAnnul: () => void;
  onReasonChange: (value: string) => void;
  onConfirmAnnul: () => void;
}): JSX.Element {
  const annulled = event.status === "ANNULLED";
  const statusLabel = deliveryLabels[event.deliveryStatus] ?? event.deliveryStatus;
  const percentLabel =
    event.deliveryStatus === "PARTIALLY_DELIVERED"
      ? ` · ${event.percent}%`
      : event.deliveryStatus === "DELIVERED"
        ? " · 100%"
        : "";

  return (
    <li
      className={cn(
        "rounded-md border px-3 py-3 text-sm",
        annulled
          ? "border-slate-200 bg-slate-50/90 text-slate-500"
          : "border-border bg-background"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium",
                annulled ? "bg-slate-200 text-slate-700" : "bg-emerald-100 text-emerald-900"
              )}
            >
              {annulled ? "Anulado" : "Ativo"}
            </span>
            <span className={cn("font-medium", annulled && "line-through decoration-slate-400")}>
              {formatDateOnly(event.effectiveDate)} · {statusLabel}
              {percentLabel}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Registrado por {event.actorLabel || "sistema"} em {formatDateTime(event.recordedAt)}
          </p>
          {event.note ? <p className="text-xs">Observação: {event.note}</p> : null}
          {annulled ? (
            <p className="text-xs">
              Anulado por {event.annulledByLabel || "sistema"} em {formatDateTime(event.annulledAt)}
              {event.annulReason ? ` — ${event.annulReason}` : ""}
            </p>
          ) : null}
        </div>
        {canAnnul && !annulled && !annulOpen ? (
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onStartAnnul}>
            Anular
          </Button>
        ) : null}
      </div>
      {canAnnul && !annulled && annulOpen ? (
        <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
          <Label htmlFor={`annul-reason-${event.id}`}>
            Justificativa da anulação <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id={`annul-reason-${event.id}`}
            value={annulReason}
            disabled={pending}
            rows={3}
            placeholder="Descreva o motivo (mínimo 10 caracteres)."
            onChange={(e) => onReasonChange(e.target.value)}
          />
          {annulHint ? (
            <p className="text-xs text-destructive" role="alert">
              {annulHint}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              A anulação não apaga o registro. Depois, registre a data efetiva correta no estado de entrega.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onCancelAnnul}>
              Cancelar
            </Button>
            <Button type="button" size="sm" disabled={pending} onClick={onConfirmAnnul}>
              {pending ? "Anulando…" : "Confirmar anulação"}
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
