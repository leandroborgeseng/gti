"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  analyzeNotificationResponse,
  cancelContractNotification,
  createNotificationFromTemplate,
  getContractNotification,
  getContractNotifications,
  getNotificationTemplates,
  getUsers,
  prepareAndSendNotification,
  setNotificationSigners,
  signContractNotification,
  transitionContractNotification,
  updateNotificationDraft,
  type ContractNotificationRecord
} from "@/lib/api";
import { authHeadersForApi } from "@/lib/auth-token";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho",
  EM_ELABORACAO: "Em elaboração",
  EM_REVISAO: "Em revisão",
  DEVOLVIDA_CORRECAO: "Devolvida",
  APROVADA_ASSINATURA: "Aprovada p/ assinatura",
  AGUARDANDO_ASSINATURA: "Aguardando assinatura",
  ASSINADA: "Assinada",
  ENVIADA: "Enviada",
  RECEBIDA: "Recebida (ciência)",
  AGUARDANDO_RESPOSTA: "Aguardando resposta",
  RESPONDIDA: "Respondida",
  EM_ANALISE: "Em análise",
  ATENDIDA: "Atendida",
  NAO_ATENDIDA: "Não atendida",
  CANCELADA: "Cancelada",
  RETIFICADA: "Retificada",
  ENCERRADA: "Encerrada"
};

type Props = { contractId: string };

export function ContractNotificationsPanel({ contractId }: Props): JSX.Element {
  const qc = useQueryClient();
  const listQ = useQuery({
    queryKey: ["contract-notifications", contractId],
    queryFn: () => getContractNotifications(contractId)
  });
  const templatesQ = useQuery({
    queryKey: ["notification-templates", false],
    queryFn: () => getNotificationTemplates(false)
  });
  const usersQ = useQuery({ queryKey: queryKeys.users, queryFn: getUsers, staleTime: 60_000 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftSubject, setDraftSubject] = useState("");
  const [signPassword, setSignPassword] = useState("");
  const [signerIds, setSignerIds] = useState<string[]>([]);
  const [extraEmails, setExtraEmails] = useState("");
  const [analysisNote, setAnalysisNote] = useState("");
  const [docBusy, setDocBusy] = useState<"print" | "pdf" | null>(null);

  async function openNotificationPrint(id: string) {
    setDocBusy("print");
    try {
      const auth = await authHeadersForApi();
      const res = await fetch(`/api/contract-notifications/${id}/print`, {
        headers: { ...auth, Accept: "text/html" },
        credentials: "include"
      });
      if (res.status === 401) {
        toast.error("Sessão expirada. Entre novamente no sistema.");
        return;
      }
      if (res.status === 403) {
        toast.error("Você não possui permissão para acessar este documento.");
        return;
      }
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(msg || "Falha ao carregar o documento");
      }
      const html = await res.text();
      const w = window.open("", "_blank");
      if (!w) {
        toast.error("Permita pop-ups para visualizar a impressão.");
        return;
      }
      w.document.open();
      w.document.write(html);
      w.document.close();
      w.focus();
      window.setTimeout(() => {
        try {
          w.print();
        } catch {
          /* ignore */
        }
      }, 300);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao imprimir");
    } finally {
      setDocBusy(null);
    }
  }

  async function downloadNotificationPdf(id: string, numberLabel: string) {
    setDocBusy("pdf");
    try {
      const auth = await authHeadersForApi();
      const res = await fetch(`/api/contract-notifications/${id}/pdf`, {
        headers: { ...auth },
        credentials: "include"
      });
      if (res.status === 401) {
        toast.error("Sessão expirada. Entre novamente no sistema.");
        return;
      }
      if (res.status === 403) {
        toast.error("Você não possui permissão para acessar este documento.");
        return;
      }
      if (!res.ok) {
        throw new Error("Falha ao gerar o PDF");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${numberLabel || "notificacao"}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao baixar PDF");
    } finally {
      setDocBusy(null);
    }
  }

  const detailQ = useQuery({
    queryKey: ["contract-notification", selectedId],
    queryFn: () => getContractNotification(selectedId!),
    enabled: Boolean(selectedId)
  });
  const selected = detailQ.data ?? (listQ.data ?? []).find((n) => n.id === selectedId) ?? null;

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["contract-notifications", contractId] });
    if (selectedId) void qc.invalidateQueries({ queryKey: ["contract-notification", selectedId] });
  }

  const createMut = useMutation({
    mutationFn: () => createNotificationFromTemplate({ contractId, templateId }),
    onSuccess: (n) => {
      toast.success(`Notificação ${n.number} criada.`);
      setSelectedId(n.id);
      setDraftBody(n.bodyHtml);
      setDraftSubject(n.subject);
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro")
  });

  const saveMut = useMutation({
    mutationFn: () =>
      updateNotificationDraft(selectedId!, { subject: draftSubject, bodyHtml: draftBody }),
    onSuccess: () => {
      toast.success("Rascunho salvo.");
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro")
  });

  const transitionMut = useMutation({
    mutationFn: (toStatus: string) => transitionContractNotification(selectedId!, { toStatus }),
    onSuccess: () => {
      toast.success("Status atualizado.");
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro")
  });

  const signersMut = useMutation({
    mutationFn: () =>
      setNotificationSigners(selectedId!, {
        signers: signerIds.map((userId, i) => ({ userId, order: i + 1, required: true }))
      }),
    onSuccess: () => {
      toast.success("Signatários definidos.");
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro")
  });

  const signMut = useMutation({
    mutationFn: () => signContractNotification(selectedId!, { password: signPassword }),
    onSuccess: () => {
      toast.success("Assinatura registrada.");
      setSignPassword("");
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro")
  });

  const sendMut = useMutation({
    mutationFn: () =>
      prepareAndSendNotification(selectedId!, {
        extraEmails: extraEmails
          .split(/[,;\s]+/)
          .map((e) => e.trim())
          .filter(Boolean)
      }),
    onSuccess: (r) => {
      if (r.ok) toast.success("Notificação enviada por e-mail.");
      else toast.error(r.send?.errorSummary || "Falha no envio de e-mail.");
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro")
  });

  function openDetail(n: ContractNotificationRecord) {
    setSelectedId(n.id);
    setDraftBody(n.bodyHtml);
    setDraftSubject(n.subject);
    setSignerIds((n.signers ?? []).map((s) => s.userId));
  }

  const editable =
    selected &&
    !selected.contentLocked &&
    ["RASCUNHO", "EM_ELABORACAO", "EM_REVISAO", "DEVOLVIDA_CORRECAO", "APROVADA_ASSINATURA"].includes(
      selected.status
    );

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h2 className="text-lg font-semibold">Notificações</h2>
        <p className="text-sm text-muted-foreground">
          Elabore a partir de um modelo, revise, assine por senha e envie à empresa. Após a primeira
          assinatura o conteúdo fica bloqueado.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <Label>Modelo</Label>
          <select
            className="mt-1 w-full rounded-md border px-2 py-2 text-sm"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            <option value="">Selecione…</option>
            {(templatesQ.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          disabled={!templateId || createMut.isPending}
          onClick={() => createMut.mutate()}
        >
          Criar do modelo
        </Button>
      </div>

      <ul className="divide-y rounded-md border">
        {(listQ.data ?? []).map((n) => (
          <li key={n.id}>
            <button
              type="button"
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/50 ${
                selectedId === n.id ? "bg-muted" : ""
              }`}
              onClick={() => openDetail(n)}
            >
              <span>
                <strong>{n.number}</strong> — {n.subject}
              </span>
              <span className="text-xs text-muted-foreground">{STATUS_LABEL[n.status] ?? n.status}</span>
            </button>
          </li>
        ))}
        {(listQ.data ?? []).length === 0 ? (
          <li className="px-3 py-4 text-sm text-muted-foreground">Nenhuma notificação neste contrato.</li>
        ) : null}
      </ul>

      {selected ? (
        <div className="space-y-3 rounded-md border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">
              {selected.number} · {STATUS_LABEL[selected.status] ?? selected.status}
            </h3>
            <div className="flex flex-wrap gap-3 text-xs">
              <button
                type="button"
                className="underline disabled:opacity-50"
                disabled={docBusy === "print"}
                onClick={() => void openNotificationPrint(selected.id)}
              >
                {docBusy === "print" ? "Carregando…" : "Imprimir / HTML"}
              </button>
              <button
                type="button"
                className="underline disabled:opacity-50"
                disabled={docBusy === "pdf"}
                onClick={() => void downloadNotificationPdf(selected.id, selected.number)}
              >
                {docBusy === "pdf" ? "Preparando…" : "Baixar PDF"}
              </button>
            </div>
          </div>

          {editable ? (
            <>
              <div>
                <Label>Assunto</Label>
                <Input value={draftSubject} onChange={(e) => setDraftSubject(e.target.value)} />
              </div>
              <div>
                <Label>Corpo HTML</Label>
                <Textarea
                  rows={8}
                  className="font-mono text-xs"
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                  Salvar rascunho
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => transitionMut.mutate("EM_REVISAO")}
                >
                  Enviar p/ revisão
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => transitionMut.mutate("APROVADA_ASSINATURA")}
                >
                  Aprovar p/ assinatura
                </Button>
              </div>
            </>
          ) : (
            <div
              className="prose prose-sm max-w-none rounded border bg-muted/30 p-3"
              dangerouslySetInnerHTML={{ __html: selected.bodyHtml }}
            />
          )}

          {["APROVADA_ASSINATURA", "AGUARDANDO_ASSINATURA"].includes(selected.status) ? (
            <div className="space-y-2 rounded border p-3">
              <Label>Signatários</Label>
              <select
                multiple
                className="h-28 w-full rounded border px-2 text-sm"
                value={signerIds}
                onChange={(e) =>
                  setSignerIds(Array.from(e.target.selectedOptions).map((o) => o.value))
                }
              >
                {(usersQ.data ?? [])
                  .filter((u) => u.userKind !== "EXTERNAL" && u.approvalStatus === "APPROVED")
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName || u.email}
                    </option>
                  ))}
              </select>
              <Button type="button" size="sm" onClick={() => signersMut.mutate()}>
                Definir signatários e aguardar assinatura
              </Button>
              <div className="flex flex-wrap items-end gap-2 pt-2">
                <div className="flex-1">
                  <Label>Assinar com senha</Label>
                  <Input
                    type="password"
                    autoComplete="current-password"
                    value={signPassword}
                    onChange={(e) => setSignPassword(e.target.value)}
                    placeholder="Confirme sua senha do SIGTI"
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={!signPassword || signMut.isPending}
                  onClick={() => signMut.mutate()}
                >
                  Assinar
                </Button>
              </div>
            </div>
          ) : null}

          {selected.status === "ASSINADA" ? (
            <div className="space-y-2 rounded border p-3">
              <Label>E-mails extras (opcional)</Label>
              <Input
                value={extraEmails}
                onChange={(e) => setExtraEmails(e.target.value)}
                placeholder="email1@empresa.com, email2@…"
              />
              <Button type="button" onClick={() => sendMut.mutate()} disabled={sendMut.isPending}>
                Enviar por e-mail
              </Button>
            </div>
          ) : null}

          {(selected.responses ?? []).filter((r) => !r.draft).length > 0 ? (
            <div className="space-y-2 rounded border p-3">
              <h4 className="text-sm font-medium">Manifestações da empresa</h4>
              {selected.responses
                ?.filter((r) => !r.draft)
                .map((r) => (
                  <div key={r.id} className="rounded bg-muted/40 p-2 text-sm">
                    <p className="whitespace-pre-wrap">{r.bodyText}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Análise: {r.analysisStatus ?? "pendente"}
                    </p>
                    {!r.analysisStatus ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Input
                          placeholder="Justificativa da análise"
                          value={analysisNote}
                          onChange={(e) => setAnalysisNote(e.target.value)}
                        />
                        {(["ACEITA", "PARCIAL", "REJEITADA", "PENDENTE", "ATENDIDA"] as const).map(
                          (st) => (
                            <Button
                              key={st}
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                void analyzeNotificationResponse(selected.id, r.id, {
                                  analysisStatus: st,
                                  analysisNote: analysisNote || st
                                })
                                  .then(() => {
                                    toast.success("Análise registrada.");
                                    refresh();
                                  })
                                  .catch((e) =>
                                    toast.error(e instanceof Error ? e.message : "Erro")
                                  );
                              }}
                            >
                              {st}
                            </Button>
                          )
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
            </div>
          ) : null}

          {selected.events && selected.events.length > 0 ? (
            <div>
              <h4 className="mb-1 text-sm font-medium">Linha do tempo</h4>
              <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                {selected.events.map((ev) => (
                  <li key={ev.id}>
                    {new Date(ev.createdAt).toLocaleString("pt-BR")} — {ev.eventType}
                    {ev.note ? `: ${ev.note}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {!["CANCELADA", "RETIFICADA", "ENCERRADA"].includes(selected.status) ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => {
                const reason = prompt("Justificativa do cancelamento:");
                if (!reason || reason.trim().length < 5) return;
                void cancelContractNotification(selected.id, { reason: reason.trim() })
                  .then(() => {
                    toast.success("Cancelada.");
                    refresh();
                  })
                  .catch((e) => toast.error(e instanceof Error ? e.message : "Erro"));
              }}
            >
              Cancelar com justificativa
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
