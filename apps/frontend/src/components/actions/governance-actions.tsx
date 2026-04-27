"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  acknowledgeGovernanceTicket,
  classifyGovernanceTicket,
  extendGovernanceDeadline,
  notifyGovernanceManager,
  resolveGovernanceTicket,
  runGovernanceMonitoring,
  sendGovernanceToControladoria
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import {
  GOVERNANCE_ACKNOWLEDGE_DEFAULTS,
  GOVERNANCE_CLASSIFY_DEFAULTS,
  GOVERNANCE_CONTROLADORIA_DEFAULTS,
  GOVERNANCE_EXTEND_DEFAULTS,
  GOVERNANCE_NOTIFY_DEFAULTS,
  GOVERNANCE_RESOLVE_DEFAULTS,
  governanceAcknowledgeSchema,
  governanceClassifySchema,
  governanceControladoriaSchema,
  governanceExtendSchema,
  governanceNotifySchema,
  governanceResolveSchema,
  type GovernanceAcknowledgeValues,
  type GovernanceClassifyValues,
  type GovernanceControladoriaValues,
  type GovernanceExtendValues,
  type GovernanceNotifyValues,
  type GovernanceResolveValues
} from "@/modules/governance/governance-detail-actions-schemas";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type DetailProps = {
  ticketId: string;
};

type ListActionsProps = {
  onMonitoringComplete?: () => void;
};

export function GovernanceListActions({ onMonitoringComplete }: ListActionsProps): JSX.Element {
  const qc = useQueryClient();
  const [message, setMessage] = useState("");

  const monitoring = useMutation({
    mutationFn: runGovernanceMonitoring,
    onSuccess: (result) => {
      const msg = `Monitoramento executado. Verificados: ${result.checked ?? 0} | SLA violados: ${result.slaViolated ?? 0} | Escalados: ${result.escalated ?? 0}`;
      setMessage(msg);
      toast.success("Monitoramento de SLA concluído.");
      void qc.invalidateQueries({ queryKey: queryKeys.governanceTickets });
      onMonitoringComplete?.();
    },
    onError: (e: unknown) => {
      const err = e instanceof Error ? e.message : String(e);
      setMessage(err);
      toast.error(err);
    }
  });

  return (
    <div className="space-y-2">
      <Button type="button" variant="secondary" onClick={() => monitoring.mutate()} disabled={monitoring.isPending}>
        {monitoring.isPending ? "A executar…" : "Executar monitoramento de SLA"}
      </Button>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}

export function GovernanceDetailActions({ ticketId }: DetailProps): JSX.Element {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.governanceTickets });
  };

  const formAck = useForm<GovernanceAcknowledgeValues>({
    resolver: zodResolver(governanceAcknowledgeSchema),
    defaultValues: GOVERNANCE_ACKNOWLEDGE_DEFAULTS
  });

  const formClassify = useForm<GovernanceClassifyValues>({
    resolver: zodResolver(governanceClassifySchema),
    defaultValues: GOVERNANCE_CLASSIFY_DEFAULTS
  });

  const formNotify = useForm<GovernanceNotifyValues>({
    resolver: zodResolver(governanceNotifySchema),
    defaultValues: GOVERNANCE_NOTIFY_DEFAULTS
  });

  const formResolve = useForm<GovernanceResolveValues>({
    resolver: zodResolver(governanceResolveSchema),
    defaultValues: GOVERNANCE_RESOLVE_DEFAULTS
  });

  const formExtend = useForm<GovernanceExtendValues>({
    resolver: zodResolver(governanceExtendSchema),
    defaultValues: GOVERNANCE_EXTEND_DEFAULTS
  });

  const formControladoria = useForm<GovernanceControladoriaValues>({
    resolver: zodResolver(governanceControladoriaSchema),
    defaultValues: GOVERNANCE_CONTROLADORIA_DEFAULTS
  });

  const ackMut = useMutation({
    mutationFn: (v: GovernanceAcknowledgeValues) => acknowledgeGovernanceTicket(ticketId, { acknowledgedAt: v.acknowledgedAt }),
    onSuccess: () => {
      toast.success("Ciência registrada.");
      invalidate();
      formAck.reset(GOVERNANCE_ACKNOWLEDGE_DEFAULTS);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro ao registrar ciência.")
  });

  const classifyMut = useMutation({
    mutationFn: (v: GovernanceClassifyValues) => classifyGovernanceTicket(ticketId, { priority: v.priority, type: v.type }),
    onSuccess: () => {
      toast.success("Classificação atualizada.");
      invalidate();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro ao classificar.")
  });

  const notifyMut = useMutation({
    mutationFn: (v: GovernanceNotifyValues) =>
      notifyGovernanceManager(ticketId, { managerNotified: true, description: v.description.trim() }),
    onSuccess: () => {
      toast.success("Notificação registrada.");
      invalidate();
      formNotify.reset(GOVERNANCE_NOTIFY_DEFAULTS);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro ao notificar.")
  });

  const resolveMut = useMutation({
    mutationFn: (v: GovernanceResolveValues) => resolveGovernanceTicket(ticketId, { resolvedAt: v.resolvedAt }),
    onSuccess: () => {
      toast.success("Chamado resolvido.");
      invalidate();
      formResolve.reset(GOVERNANCE_RESOLVE_DEFAULTS);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro ao resolver.")
  });

  const extendMut = useMutation({
    mutationFn: (v: GovernanceExtendValues) =>
      extendGovernanceDeadline(ticketId, {
        newDeadline: v.newDeadline,
        justification: v.justification.trim(),
        createdBy: v.createdBy.trim()
      }),
    onSuccess: () => {
      toast.success("Prazo estendido.");
      invalidate();
      formExtend.reset(GOVERNANCE_EXTEND_DEFAULTS);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro ao estender prazo.")
  });

  const controladoriaMut = useMutation({
    mutationFn: (v: GovernanceControladoriaValues) =>
      sendGovernanceToControladoria(ticketId, {
        seiProcessNumber: v.seiProcessNumber.trim(),
        controladoriaUserId: v.controladoriaUserId.trim() || undefined
      }),
    onSuccess: () => {
      toast.success("Enviado à controladoria.");
      invalidate();
      formControladoria.reset(GOVERNANCE_CONTROLADORIA_DEFAULTS);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro ao enviar.")
  });

  const busy =
    ackMut.isPending ||
    classifyMut.isPending ||
    notifyMut.isPending ||
    resolveMut.isPending ||
    extendMut.isPending ||
    controladoriaMut.isPending;

  const blockClass = "space-y-3 rounded-lg border border-border bg-card/40 p-4";

  return (
    <div className="space-y-4">
      <Form {...formAck}>
        <form className={blockClass} onSubmit={formAck.handleSubmit((v) => ackMut.mutate(v))}>
          <p className="text-sm font-semibold text-foreground">Registrar ciência</p>
          <FormField
            control={formAck.control}
            name="acknowledgedAt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data e hora</FormLabel>
                <FormControl>
                  <Input type="datetime-local" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" disabled={busy}>
            {ackMut.isPending ? "Salvando…" : "Registrar ciência"}
          </Button>
        </form>
      </Form>

      <Form {...formClassify}>
        <form className={blockClass} onSubmit={formClassify.handleSubmit((v) => classifyMut.mutate(v))}>
          <p className="text-sm font-semibold text-foreground">Classificar chamado</p>
          <div className="grid gap-3 md:grid-cols-2">
            <FormField
              control={formClassify.control}
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prioridade</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="LOW">Baixa</SelectItem>
                      <SelectItem value="MEDIUM">Média</SelectItem>
                      <SelectItem value="HIGH">Alta</SelectItem>
                      <SelectItem value="CRITICAL">Crítica</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={formClassify.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="CORRETIVA">Corretiva</SelectItem>
                      <SelectItem value="EVOLUTIVA">Evolutiva</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <Button type="submit" disabled={busy}>
            {classifyMut.isPending ? "Salvando…" : "Classificar"}
          </Button>
        </form>
      </Form>

      <Form {...formNotify}>
        <form className={blockClass} onSubmit={formNotify.handleSubmit((v) => notifyMut.mutate(v))}>
          <p className="text-sm font-semibold text-foreground">Notificar gestor</p>
          <FormField
            control={formNotify.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Descrição</FormLabel>
                <FormControl>
                  <Textarea rows={2} placeholder="Descrição da ação de notificação" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" variant="secondary" disabled={busy}>
            {notifyMut.isPending ? "Salvando…" : "Registrar notificação"}
          </Button>
        </form>
      </Form>

      <Form {...formResolve}>
        <form className={blockClass} onSubmit={formResolve.handleSubmit((v) => resolveMut.mutate(v))}>
          <p className="text-sm font-semibold text-foreground">Registrar resolução</p>
          <FormField
            control={formResolve.control}
            name="resolvedAt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data e hora</FormLabel>
                <FormControl>
                  <Input type="datetime-local" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" disabled={busy}>
            {resolveMut.isPending ? "Salvando…" : "Marcar como resolvido"}
          </Button>
        </form>
      </Form>

      <Form {...formExtend}>
        <form className={blockClass} onSubmit={formExtend.handleSubmit((v) => extendMut.mutate(v))}>
          <p className="text-sm font-semibold text-foreground">Extensão de prazo</p>
          <FormField
            control={formExtend.control}
            name="newDeadline"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Novo prazo</FormLabel>
                <FormControl>
                  <Input type="datetime-local" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={formExtend.control}
            name="justification"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Justificativa</FormLabel>
                <FormControl>
                  <Textarea rows={3} placeholder="Justificativa" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={formExtend.control}
            name="createdBy"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Usuário responsável</FormLabel>
                <FormControl>
                  <Input placeholder="Identificador do usuário" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" variant="outline" disabled={busy}>
            {extendMut.isPending ? "Salvando…" : "Estender prazo"}
          </Button>
        </form>
      </Form>

      <Form {...formControladoria}>
        <form className={blockClass} onSubmit={formControladoria.handleSubmit((v) => controladoriaMut.mutate(v))}>
          <p className="text-sm font-semibold text-foreground">Encaminhar para controladoria</p>
          <FormField
            control={formControladoria.control}
            name="seiProcessNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Número do processo SEI</FormLabel>
                <FormControl>
                  <Input placeholder="Número do processo SEI" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={formControladoria.control}
            name="controladoriaUserId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Usuário da controladoria (opcional)</FormLabel>
                <FormControl>
                  <Input placeholder="Opcional" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" variant="secondary" disabled={busy}>
            {controladoriaMut.isPending ? "A enviar…" : "Enviar para controladoria"}
          </Button>
        </form>
      </Form>
    </div>
  );
}
