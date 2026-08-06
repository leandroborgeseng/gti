"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  createNotificationTemplate,
  deactivateNotificationTemplate,
  getNotificationTemplates,
  getNotificationMailMergeFields,
  updateNotificationTemplate,
  type NotificationTemplateRecord
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const emptyForm = {
  name: "",
  documentTitle: "",
  emailSubject: "",
  bodyHtml: "<p>Prezados,</p><p>…</p>",
  headerHtml: "",
  footerHtml: "",
  defaultResponseDays: 5,
  requiresAck: true,
  requiresResponse: false
};

export function NotificationTemplatesAdminPanel(): JSX.Element {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["notification-templates", true],
    queryFn: () => getNotificationTemplates(true)
  });
  const fieldsQ = useQuery({
    queryKey: ["notification-mail-merge"],
    queryFn: getNotificationMailMergeFields
  });
  const [editing, setEditing] = useState<NotificationTemplateRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [bodyRef, setBodyRef] = useState<HTMLTextAreaElement | null>(null);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (editing) {
        return updateNotificationTemplate(editing.id, form);
      }
      return createNotificationTemplate(form);
    },
    onSuccess: () => {
      toast.success(editing ? "Modelo atualizado." : "Modelo criado.");
      setEditing(null);
      setForm(emptyForm);
      void qc.invalidateQueries({ queryKey: ["notification-templates"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar")
  });

  const deactivateMut = useMutation({
    mutationFn: (id: string) => deactivateNotificationTemplate(id),
    onSuccess: () => {
      toast.success("Modelo inativado.");
      void qc.invalidateQueries({ queryKey: ["notification-templates"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro")
  });

  function startEdit(t: NotificationTemplateRecord) {
    setEditing(t);
    setForm({
      name: t.name,
      documentTitle: t.documentTitle,
      emailSubject: t.emailSubject,
      bodyHtml: t.bodyHtml,
      headerHtml: t.headerHtml ?? "",
      footerHtml: t.footerHtml ?? "",
      defaultResponseDays: t.defaultResponseDays,
      requiresAck: t.requiresAck,
      requiresResponse: t.requiresResponse
    });
  }

  function insertField(field: string) {
    if (!bodyRef) {
      setForm((f) => ({ ...f, bodyHtml: `${f.bodyHtml}${field}` }));
      return;
    }
    const start = bodyRef.selectionStart ?? bodyRef.value.length;
    const end = bodyRef.selectionEnd ?? start;
    const next = bodyRef.value.slice(0, start) + field + bodyRef.value.slice(end);
    setForm((f) => ({ ...f, bodyHtml: next }));
    requestAnimationFrame(() => {
      bodyRef.focus();
      const pos = start + field.length;
      bodyRef.setSelectionRange(pos, pos);
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Modelos de notificação</h2>
        <p className="text-sm text-muted-foreground">
          Crie modelos reutilizáveis com campos de mala direta. Modelos já usados não podem ser excluídos —
          apenas inativados. Edições de conteúdo geram nova versão quando o modelo já tiver sido aplicado.
        </p>
      </div>

      <Card className="space-y-4 p-4">
        <h3 className="font-medium">{editing ? `Editar · v${editing.version}` : "Novo modelo"}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Nome</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Título do documento</Label>
            <Input
              value={form.documentTitle}
              onChange={(e) => setForm({ ...form, documentTitle: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Assunto do e-mail</Label>
            <Input
              value={form.emailSubject}
              onChange={(e) => setForm({ ...form, emailSubject: e.target.value })}
            />
          </div>
          <div>
            <Label>Prazo padrão de resposta (dias)</Label>
            <Input
              type="number"
              min={0}
              value={form.defaultResponseDays}
              onChange={(e) => setForm({ ...form, defaultResponseDays: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="flex items-end gap-4 pb-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.requiresAck}
                onChange={(e) => setForm({ ...form, requiresAck: e.target.checked })}
              />
              Exige ciência
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.requiresResponse}
                onChange={(e) => setForm({ ...form, requiresResponse: e.target.checked })}
              />
              Exige manifestação
            </label>
          </div>
        </div>
        <div>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <Label>Corpo (HTML)</Label>
            <div className="flex flex-wrap gap-1">
              <span className="text-xs text-muted-foreground">Inserir campo:</span>
              {(fieldsQ.data ?? []).slice(0, 8).map((f) => (
                <Button key={f} type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => insertField(f)}>
                  {f.replace(/[{}]/g, "")}
                </Button>
              ))}
            </div>
          </div>
          <Textarea
            ref={(el) => setBodyRef(el)}
            rows={10}
            className="font-mono text-xs"
            value={form.bodyHtml}
            onChange={(e) => setForm({ ...form, bodyHtml: e.target.value })}
          />
        </div>
        <div className="flex gap-2">
          <Button type="button" onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !form.name.trim()}>
            {editing ? "Salvar alterações" : "Criar modelo"}
          </Button>
          {editing ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditing(null);
                setForm(emptyForm);
              }}
            >
              Cancelar
            </Button>
          ) : null}
        </div>
      </Card>

      <div className="space-y-2">
        {(q.data ?? []).map((t) => (
          <Card key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div>
              <p className="font-medium">
                {t.name}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  v{t.version} · {t.active ? "Ativo" : "Inativo"}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">{t.documentTitle}</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => startEdit(t)}>
                Editar
              </Button>
              {t.active ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (confirm("Inativar este modelo?")) deactivateMut.mutate(t.id);
                  }}
                >
                  Inativar
                </Button>
              ) : null}
            </div>
          </Card>
        ))}
        {q.isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : null}
      </div>
    </div>
  );
}
