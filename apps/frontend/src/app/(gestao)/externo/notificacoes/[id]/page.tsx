"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  acknowledgeContractNotification,
  getContractNotification,
  saveNotificationResponse
} from "@/lib/api";
import { authHeadersForApi } from "@/lib/auth-token";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type ItemStatusValue = {
  status: "ACEITO" | "CONTESTADO" | "PENDENTE";
  justification: string;
};

type RelatedItemRow = {
  key: string;
  label: string;
};

const ITEM_STATUS_LABELS: Record<ItemStatusValue["status"], string> = {
  ACEITO: "Aceito",
  CONTESTADO: "Contestado",
  PENDENTE: "Pendente"
};

const RELATED_BUCKETS: Array<{ field: string; label: string }> = [
  { field: "itemIds", label: "Item contratual" },
  { field: "featureIds", label: "Funcionalidade" },
  { field: "measurementIds", label: "Medição" },
  { field: "occurrenceIds", label: "Ocorrência" },
  { field: "scheduleIds", label: "Cronograma" }
];

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

function parseRelatedItems(related: unknown): RelatedItemRow[] {
  if (!related || typeof related !== "object") return [];
  const r = related as Record<string, unknown>;
  const out: RelatedItemRow[] = [];
  const seen = new Set<string>();

  for (const { field, label } of RELATED_BUCKETS) {
    const ids = r[field];
    if (!Array.isArray(ids)) continue;
    for (const raw of ids) {
      if (typeof raw !== "string" || !raw.trim()) continue;
      const id = raw.trim();
      const key = `${field}:${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key, label: `${label} ${shortId(id)}` });
    }
  }

  const items = r.items;
  if (Array.isArray(items)) {
    for (const raw of items) {
      if (!raw || typeof raw !== "object") continue;
      const it = raw as Record<string, unknown>;
      const id = typeof it.id === "string" ? it.id : typeof it.key === "string" ? it.key : "";
      if (!id) continue;
      const type = typeof it.type === "string" ? it.type : "Item";
      const name = typeof it.label === "string" ? it.label : typeof it.name === "string" ? it.name : shortId(id);
      const key = `items:${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key, label: `${type}: ${name}` });
    }
  }

  return out;
}

function parseItemStatuses(raw: unknown): Record<string, ItemStatusValue> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, ItemStatusValue> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    const status =
      v.status === "ACEITO" || v.status === "CONTESTADO" || v.status === "PENDENTE"
        ? v.status
        : "PENDENTE";
    out[key] = {
      status,
      justification: typeof v.justification === "string" ? v.justification : ""
    };
  }
  return out;
}

export default function ExternoNotificacaoDetailPage(): JSX.Element {
  const params = useParams();
  const id = String(params?.id ?? "");
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: queryKeys.contractNotification(id),
    queryFn: () => getContractNotification(id),
    enabled: Boolean(id)
  });
  const [body, setBody] = useState("");
  const [itemStatuses, setItemStatuses] = useState<Record<string, ItemStatusValue>>({});
  const [hydrated, setHydrated] = useState(false);
  const [docBusy, setDocBusy] = useState<"print" | "pdf" | null>(null);
  const n = q.data;

  const relatedItems = useMemo(() => parseRelatedItems(n?.related), [n?.related]);

  async function openPrint() {
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
      if (!res.ok) throw new Error("Falha ao carregar o documento");
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

  async function downloadPdf() {
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
      if (!res.ok) throw new Error("Falha ao gerar o PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${n?.number || "notificacao"}.pdf`;
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

  useEffect(() => {
    if (!n || hydrated) return;
    const draft = n.responses?.find((r) => r.draft);
    setBody(draft?.bodyText ?? "");
    setItemStatuses(parseItemStatuses(draft?.itemStatuses));
    setHydrated(true);
  }, [n, hydrated]);

  const ackMut = useMutation({
    mutationFn: () => acknowledgeContractNotification(id),
    onSuccess: () => {
      toast.success("Ciência registrada.");
      void qc.invalidateQueries({ queryKey: queryKeys.contractNotification(id) });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro")
  });

  const respMut = useMutation({
    mutationFn: (submit: boolean) =>
      saveNotificationResponse(id, {
        bodyText: body,
        itemStatuses: relatedItems.length > 0 ? itemStatuses : undefined,
        submit
      }),
    onSuccess: (_r, submit) => {
      toast.success(submit ? "Manifestação enviada." : "Rascunho salvo.");
      void qc.invalidateQueries({ queryKey: queryKeys.contractNotification(id) });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro")
  });

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!n) return <p className="text-sm">Notificação não encontrada.</p>;

  const draft = n.responses?.find((r) => r.draft);
  const submitted = n.responses?.filter((r) => !r.draft) ?? [];
  const canRespond =
    n.requiresResponse &&
    ["ENVIADA", "RECEBIDA", "AGUARDANDO_RESPOSTA"].includes(n.status) &&
    submitted.length === 0;

  function updateItemStatus(key: string, patch: Partial<ItemStatusValue>): void {
    setItemStatuses((prev) => {
      const current = prev[key] ?? { status: "PENDENTE" as const, justification: "" };
      return { ...prev, [key]: { ...current, ...patch } };
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link href="/externo/notificacoes" className="underline">
          ← Voltar às notificações
        </Link>
      </p>
      <div>
        <h1 className="text-2xl font-semibold">{n.number}</h1>
        <p className="text-sm text-muted-foreground">{n.subject}</p>
        {n.responseDeadline ? (
          <p className="mt-1 text-xs text-amber-800">
            Prazo de resposta: {new Date(n.responseDeadline).toLocaleDateString("pt-BR")}
          </p>
        ) : null}
      </div>

      <Card className="prose prose-sm max-w-none p-4" dangerouslySetInnerHTML={{ __html: n.bodyHtml }} />

      <div className="flex flex-wrap gap-2">
        {n.requiresAck && !n.ackAt ? (
          <Button
            type="button"
            onClick={() => {
              if (confirm("Confirma a ciência desta notificação?")) ackMut.mutate();
            }}
            disabled={ackMut.isPending}
          >
            Dar ciência
          </Button>
        ) : n.ackAt ? (
          <p className="text-sm text-muted-foreground">
            Ciência registrada em {new Date(n.ackAt).toLocaleString("pt-BR")}
          </p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={docBusy === "print"}
          onClick={() => void openPrint()}
        >
          {docBusy === "print" ? "Carregando…" : "Imprimir documento"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={docBusy === "pdf"}
          onClick={() => void downloadPdf()}
        >
          {docBusy === "pdf" ? "Preparando…" : "Baixar PDF"}
        </Button>
      </div>

      {canRespond ? (
        <Card className="space-y-3 p-4">
          <h2 className="font-medium">Manifestação</h2>
          <Textarea
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={draft?.bodyText ? undefined : "Elabore a resposta da empresa…"}
          />

          {relatedItems.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Resposta por item vinculado</h3>
              <p className="text-xs text-muted-foreground">
                Informe o status e, se necessário, a justificativa de cada item relacionado à notificação.
              </p>
              {relatedItems.map((item) => {
                const current = itemStatuses[item.key] ?? { status: "PENDENTE" as const, justification: "" };
                return (
                  <div key={item.key} className="space-y-2 rounded-md border p-3">
                    <p className="text-sm font-medium">{item.label}</p>
                    <label className="block text-xs text-muted-foreground">
                      Status
                      <select
                        className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm text-foreground"
                        value={current.status}
                        onChange={(e) =>
                          updateItemStatus(item.key, {
                            status: e.target.value as ItemStatusValue["status"]
                          })
                        }
                      >
                        {Object.entries(ITEM_STATUS_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs text-muted-foreground">
                      Justificativa
                      <Textarea
                        className="mt-1"
                        rows={2}
                        value={current.justification}
                        onChange={(e) => updateItemStatus(item.key, { justification: e.target.value })}
                        placeholder="Obrigatória se contestado"
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => respMut.mutate(false)}>
              Salvar rascunho
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (confirm("Enviar manifestação? Após o envio não será possível editar.")) {
                  respMut.mutate(true);
                }
              }}
            >
              Enviar manifestação
            </Button>
          </div>
        </Card>
      ) : null}

      {submitted.map((r) => {
        const submittedItems = parseItemStatuses(r.itemStatuses);
        const submittedKeys = Object.keys(submittedItems);
        return (
          <Card key={r.id} className="space-y-2 p-4">
            <h2 className="font-medium">Manifestação enviada</h2>
            <p className="whitespace-pre-wrap text-sm">{r.bodyText}</p>
            {submittedKeys.length > 0 ? (
              <div className="space-y-2 border-t pt-2">
                <h3 className="text-sm font-medium">Itens</h3>
                {submittedKeys.map((key) => {
                  const row = relatedItems.find((i) => i.key === key);
                  const st = submittedItems[key];
                  return (
                    <div key={key} className="text-sm">
                      <p className="font-medium">
                        {row?.label ?? key} — {ITEM_STATUS_LABELS[st.status] ?? st.status}
                      </p>
                      {st.justification ? (
                        <p className="whitespace-pre-wrap text-muted-foreground">{st.justification}</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
            {/* Análises internas deliberadamente omitidas na área externa */}
          </Card>
        );
      })}
    </div>
  );
}
