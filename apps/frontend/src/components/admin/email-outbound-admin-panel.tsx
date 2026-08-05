"use client";

import { useQuery } from "@tanstack/react-query";
import { Mail, RefreshCw, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { EmailOutboundPublicConfig, EmailSendLogItem } from "@/lib/api";
import {
  getEmailOutboundConfig,
  getEmailOutboundLogs,
  saveEmailOutboundConfig,
  testEmailOutbound
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type FormState = {
  smtpHost: string;
  smtpPort: string;
  security: "NONE" | "STARTTLS" | "SSL_TLS";
  authRequired: boolean;
  username: string;
  password: string;
  authMethod: "USER_PASS" | "APP_PASSWORD" | "OAUTH";
  oauthClientId: string;
  oauthTenantId: string;
  oauthRefreshToken: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  ccDefault: string;
  bccDefault: string;
  failureAlertEmail: string;
  subjectPrefix: string;
  footerSignature: string;
  confidentialityText: string;
  maxAttachmentBytes: string;
  maxRecipients: string;
  retryIntervalSec: string;
  maxRetries: string;
  attachNotificationPdf: boolean;
  attachmentsAsLink: boolean;
  requirePortalAccess: boolean;
  imapHost: string;
  imapPort: string;
  imapSecurity: "NONE" | "STARTTLS" | "SSL_TLS";
  imapUsername: string;
  imapPassword: string;
  active: boolean;
  activationJustification: string;
};

const EMPTY_FORM: FormState = {
  smtpHost: "",
  smtpPort: "587",
  security: "STARTTLS",
  authRequired: true,
  username: "",
  password: "",
  authMethod: "USER_PASS",
  oauthClientId: "",
  oauthTenantId: "",
  oauthRefreshToken: "",
  fromName: "",
  fromEmail: "",
  replyTo: "",
  ccDefault: "",
  bccDefault: "",
  failureAlertEmail: "",
  subjectPrefix: "[SIGTI]",
  footerSignature: "",
  confidentialityText: "",
  maxAttachmentBytes: String(10 * 1024 * 1024),
  maxRecipients: "50",
  retryIntervalSec: "60",
  maxRetries: "3",
  attachNotificationPdf: false,
  attachmentsAsLink: false,
  requirePortalAccess: false,
  imapHost: "",
  imapPort: "993",
  imapSecurity: "SSL_TLS",
  imapUsername: "",
  imapPassword: "",
  active: false,
  activationJustification: ""
};

function formFromConfig(cfg: EmailOutboundPublicConfig): FormState {
  return {
    ...EMPTY_FORM,
    smtpHost: cfg.smtpHost,
    smtpPort: String(cfg.smtpPort),
    security: cfg.security,
    authRequired: cfg.authRequired,
    username: cfg.username,
    password: "",
    authMethod: cfg.authMethod,
    oauthClientId: cfg.oauthClientId,
    oauthTenantId: cfg.oauthTenantId,
    oauthRefreshToken: "",
    fromName: cfg.fromName,
    fromEmail: cfg.fromEmail,
    replyTo: cfg.replyTo,
    ccDefault: cfg.ccDefault,
    bccDefault: cfg.bccDefault,
    failureAlertEmail: cfg.failureAlertEmail,
    subjectPrefix: cfg.subjectPrefix,
    footerSignature: cfg.footerSignature,
    confidentialityText: cfg.confidentialityText,
    maxAttachmentBytes: String(cfg.maxAttachmentBytes),
    maxRecipients: String(cfg.maxRecipients),
    retryIntervalSec: String(cfg.retryIntervalSec),
    maxRetries: String(cfg.maxRetries),
    attachNotificationPdf: cfg.attachNotificationPdf,
    attachmentsAsLink: cfg.attachmentsAsLink,
    requirePortalAccess: cfg.requirePortalAccess,
    imapHost: cfg.imapHost,
    imapPort: String(cfg.imapPort),
    imapSecurity: cfg.imapSecurity,
    imapUsername: cfg.imapUsername,
    imapPassword: "",
    active: cfg.active,
    activationJustification: cfg.activationJustification ?? ""
  };
}

function statusLabel(status: string): string {
  switch (status) {
    case "NOT_CONFIGURED":
      return "Não configurado";
    case "CONFIGURED_UNTESTED":
      return "Configurado (não testado)";
    case "TEST_OK":
      return "Teste OK";
    case "ACTIVE":
      return "Ativo";
    case "FAILED":
      return "Falha no teste";
    default:
      return status;
  }
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR");
}

export function EmailOutboundAdminPanel(): JSX.Element {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [credentialConfigured, setCredentialConfigured] = useState(false);
  const [status, setStatus] = useState("NOT_CONFIGURED");
  const [lastTestAt, setLastTestAt] = useState<string | null>(null);
  const [lastTestOk, setLastTestOk] = useState<boolean | null>(null);
  const [lastTestError, setLastTestError] = useState<string | null>(null);
  const [testTo, setTestTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const configQuery = useQuery({
    queryKey: queryKeys.emailOutboundConfig,
    queryFn: getEmailOutboundConfig
  });

  const logsQuery = useQuery({
    queryKey: queryKeys.emailOutboundLogs,
    queryFn: () => getEmailOutboundLogs(20)
  });

  useEffect(() => {
    if (!configQuery.data) return;
    setForm(formFromConfig(configQuery.data));
    setCredentialConfigured(configQuery.data.credentialConfigured);
    setStatus(configQuery.data.status);
    setLastTestAt(configQuery.data.lastTestAt);
    setLastTestOk(configQuery.data.lastTestOk);
    setLastTestError(configQuery.data.lastTestError);
  }, [configQuery.data]);

  const patch = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onSave = async () => {
    setSaving(true);
    try {
      const saved = await saveEmailOutboundConfig({
        smtpHost: form.smtpHost,
        smtpPort: Number(form.smtpPort),
        security: form.security,
        authRequired: form.authRequired,
        username: form.username,
        password: form.password || undefined,
        authMethod: form.authMethod,
        oauthClientId: form.oauthClientId,
        oauthTenantId: form.oauthTenantId,
        oauthRefreshToken: form.oauthRefreshToken || undefined,
        fromName: form.fromName,
        fromEmail: form.fromEmail,
        replyTo: form.replyTo,
        ccDefault: form.ccDefault,
        bccDefault: form.bccDefault,
        failureAlertEmail: form.failureAlertEmail,
        subjectPrefix: form.subjectPrefix,
        footerSignature: form.footerSignature,
        confidentialityText: form.confidentialityText,
        maxAttachmentBytes: Number(form.maxAttachmentBytes),
        maxRecipients: Number(form.maxRecipients),
        retryIntervalSec: Number(form.retryIntervalSec),
        maxRetries: Number(form.maxRetries),
        attachNotificationPdf: form.attachNotificationPdf,
        attachmentsAsLink: form.attachmentsAsLink,
        requirePortalAccess: form.requirePortalAccess,
        active: form.active,
        activationJustification: form.activationJustification || null,
        imapHost: form.imapHost,
        imapPort: Number(form.imapPort),
        imapSecurity: form.imapSecurity,
        imapUsername: form.imapUsername,
        imapPassword: form.imapPassword || undefined
      });
      setForm(formFromConfig(saved));
      setCredentialConfigured(saved.credentialConfigured);
      setStatus(saved.status);
      setLastTestAt(saved.lastTestAt);
      setLastTestOk(saved.lastTestOk);
      setLastTestError(saved.lastTestError);
      toast.success("Configuração de e-mail salva.");
      await Promise.all([configQuery.refetch(), logsQuery.refetch()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const onTest = async () => {
    setTesting(true);
    try {
      const result = await testEmailOutbound(testTo);
      setStatus(result.config.status);
      setLastTestAt(result.config.lastTestAt);
      setLastTestOk(result.config.lastTestOk);
      setLastTestError(result.config.lastTestError);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      await Promise.all([configQuery.refetch(), logsQuery.refetch()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no teste.");
    } finally {
      setTesting(false);
    }
  };

  const logs: EmailSendLogItem[] = logsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Mail className="h-5 w-5 text-primary" aria-hidden />
            Configuração de e-mail
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Servidor SMTP de saída, remetente, cópias e padrões de envio. A caixa de entrada (IMAP) fica
            desabilitada nesta versão. O envio operacional do sistema (recuperação de senha, boas-vindas)
            continua via Resend até a ativação SMTP estar concluída na integração.
          </p>
        </div>
        <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <div>
            Situação: <strong>{statusLabel(status)}</strong>
          </div>
          <div className="text-muted-foreground">
            Último teste: {formatDateTime(lastTestAt)}
            {lastTestOk == null ? "" : lastTestOk ? " · OK" : " · Falha"}
          </div>
        </div>
      </div>

      {configQuery.isError ? (
        <DataLoadAlert
          title="Não foi possível carregar a configuração de e-mail"
          messages={[configQuery.error instanceof Error ? configQuery.error.message : "Erro desconhecido"]}
        />
      ) : null}

      <Card className="space-y-4 p-4 sm:p-6">
        <h3 className="text-base font-semibold">Servidor de saída</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="smtpHost">Host SMTP</Label>
            <Input id="smtpHost" value={form.smtpHost} onChange={(e) => patch("smtpHost", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="smtpPort">Porta</Label>
            <Input id="smtpPort" value={form.smtpPort} onChange={(e) => patch("smtpPort", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Segurança</Label>
            <Select value={form.security} onValueChange={(v) => patch("security", v as FormState["security"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">Nenhuma</SelectItem>
                <SelectItem value="STARTTLS">STARTTLS</SelectItem>
                <SelectItem value="SSL_TLS">SSL/TLS</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Método de autenticação</Label>
            <Select
              value={form.authMethod}
              onValueChange={(v) => patch("authMethod", v as FormState["authMethod"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USER_PASS">Usuário e senha</SelectItem>
                <SelectItem value="APP_PASSWORD">Senha de aplicativo</SelectItem>
                <SelectItem value="OAUTH">OAuth (stub)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pt-6">
            <Checkbox
              id="authRequired"
              checked={form.authRequired}
              onCheckedChange={(v) => patch("authRequired", v === true)}
            />
            <Label htmlFor="authRequired">Exige autenticação</Label>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="username">Usuário</Label>
            <Input id="username" value={form.username} onChange={(e) => patch("username", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Senha / senha de aplicativo</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder={
                credentialConfigured ? "•••••••• (deixe em branco para manter)" : "Informe a senha"
              }
              value={form.password}
              onChange={(e) => patch("password", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {credentialConfigured ? "Credencial configurada (não exibida)." : "Nenhuma credencial gravada."}
            </p>
          </div>
        </div>

        {form.authMethod === "OAUTH" ? (
          <div className="grid gap-3 rounded-md border border-dashed p-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-3">
              <p className="text-sm text-muted-foreground">
                OAuth é apenas esqueleto nesta versão — os campos são persistidos, mas o envio continua por
                usuário/senha quando informado.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="oauthClientId">Client ID</Label>
              <Input
                id="oauthClientId"
                value={form.oauthClientId}
                onChange={(e) => patch("oauthClientId", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="oauthTenantId">Tenant ID</Label>
              <Input
                id="oauthTenantId"
                value={form.oauthTenantId}
                onChange={(e) => patch("oauthTenantId", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="oauthRefreshToken">Refresh token</Label>
              <Input
                id="oauthRefreshToken"
                type="password"
                placeholder="Deixe em branco para manter"
                value={form.oauthRefreshToken}
                onChange={(e) => patch("oauthRefreshToken", e.target.value)}
              />
            </div>
          </div>
        ) : null}
      </Card>

      <Card className="space-y-4 p-4 sm:p-6">
        <h3 className="text-base font-semibold">Remetente</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="fromName">Nome de exibição</Label>
            <Input id="fromName" value={form.fromName} onChange={(e) => patch("fromName", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fromEmail">E-mail do remetente</Label>
            <Input id="fromEmail" value={form.fromEmail} onChange={(e) => patch("fromEmail", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="replyTo">Reply-To</Label>
            <Input id="replyTo" value={form.replyTo} onChange={(e) => patch("replyTo", e.target.value)} />
          </div>
        </div>
      </Card>

      <Card className="space-y-4 p-4 sm:p-6">
        <h3 className="text-base font-semibold">Cópias</h3>
        <p className="text-sm text-muted-foreground">Separe vários endereços por vírgula ou ponto e vírgula.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="ccDefault">CC padrão</Label>
            <Input id="ccDefault" value={form.ccDefault} onChange={(e) => patch("ccDefault", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bccDefault">CCO padrão</Label>
            <Input
              id="bccDefault"
              value={form.bccDefault}
              onChange={(e) => patch("bccDefault", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="failureAlertEmail">Alerta de falha</Label>
            <Input
              id="failureAlertEmail"
              value={form.failureAlertEmail}
              onChange={(e) => patch("failureAlertEmail", e.target.value)}
            />
          </div>
        </div>
      </Card>

      <Card className="space-y-4 p-4 sm:p-6">
        <h3 className="text-base font-semibold">Padrões de envio</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="subjectPrefix">Prefixo do assunto</Label>
            <Input
              id="subjectPrefix"
              value={form.subjectPrefix}
              onChange={(e) => patch("subjectPrefix", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="maxAttachmentBytes">Anexo máx. (bytes)</Label>
            <Input
              id="maxAttachmentBytes"
              value={form.maxAttachmentBytes}
              onChange={(e) => patch("maxAttachmentBytes", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="maxRecipients">Máx. destinatários</Label>
            <Input
              id="maxRecipients"
              value={form.maxRecipients}
              onChange={(e) => patch("maxRecipients", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="retryIntervalSec">Intervalo retry (s)</Label>
            <Input
              id="retryIntervalSec"
              value={form.retryIntervalSec}
              onChange={(e) => patch("retryIntervalSec", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="maxRetries">Máx. tentativas</Label>
            <Input
              id="maxRetries"
              value={form.maxRetries}
              onChange={(e) => patch("maxRetries", e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="footerSignature">Assinatura / rodapé</Label>
          <Textarea
            id="footerSignature"
            rows={3}
            value={form.footerSignature}
            onChange={(e) => patch("footerSignature", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confidentialityText">Texto de confidencialidade</Label>
          <Textarea
            id="confidentialityText"
            rows={2}
            value={form.confidentialityText}
            onChange={(e) => patch("confidentialityText", e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.attachNotificationPdf}
              onCheckedChange={(v) => patch("attachNotificationPdf", v === true)}
            />
            Anexar PDF de notificação
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.attachmentsAsLink}
              onCheckedChange={(v) => patch("attachmentsAsLink", v === true)}
            />
            Anexos como link
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.requirePortalAccess}
              onCheckedChange={(v) => patch("requirePortalAccess", v === true)}
            />
            Exigir acesso ao portal
          </label>
        </div>
      </Card>

      <Card className="space-y-4 p-4 sm:p-6 opacity-80">
        <h3 className="text-base font-semibold">Caixa de entrada (desabilitada)</h3>
        <p className="text-sm text-muted-foreground">
          Recepção IMAP fica como stub nesta versão e não pode ser ativada. Os campos abaixo são apenas
          reservados para evolução futura.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 pointer-events-none opacity-60">
          <div className="space-y-1.5">
            <Label>Host IMAP</Label>
            <Input value={form.imapHost} readOnly disabled />
          </div>
          <div className="space-y-1.5">
            <Label>Porta</Label>
            <Input value={form.imapPort} readOnly disabled />
          </div>
          <div className="space-y-1.5">
            <Label>Usuário IMAP</Label>
            <Input value={form.imapUsername} readOnly disabled />
          </div>
          <div className="space-y-1.5">
            <Label>Senha IMAP</Label>
            <Input type="password" value="" placeholder="Indisponível" disabled />
          </div>
        </div>
      </Card>

      <Card className="space-y-4 p-4 sm:p-6">
        <h3 className="text-base font-semibold">Ativação e teste</h3>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.active} onCheckedChange={(v) => patch("active", v === true)} />
            Ativar envio SMTP nesta configuração
          </label>
        </div>
        {form.active && status !== "TEST_OK" && status !== "ACTIVE" && lastTestOk !== true ? (
          <div className="space-y-1.5">
            <Label htmlFor="activationJustification">Justificativa excepcional (sem teste OK)</Label>
            <Textarea
              id="activationJustification"
              rows={2}
              placeholder="Obrigatória se ativar sem teste bem-sucedido (mín. 10 caracteres)."
              value={form.activationJustification}
              onChange={(e) => patch("activationJustification", e.target.value)}
            />
          </div>
        ) : null}
        {lastTestError && lastTestOk === false ? (
          <p className="text-sm text-destructive">{lastTestError}</p>
        ) : null}
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1 space-y-1.5">
            <Label htmlFor="testTo">Enviar e-mail de teste para</Label>
            <Input
              id="testTo"
              type="email"
              placeholder="admin@exemplo.gov.br"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
            />
          </div>
          <Button type="button" variant="secondary" disabled={testing} onClick={() => void onTest()}>
            <Send className="mr-2 h-4 w-4" />
            {testing ? "Testando…" : "Enviar e-mail de teste"}
          </Button>
          <Button type="button" disabled={saving || configQuery.isLoading} onClick={() => void onSave()}>
            {saving ? "Salvando…" : "Salvar configuração"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void configQuery.refetch();
              void logsQuery.refetch();
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
        </div>
      </Card>

      <Card className="space-y-3 p-4 sm:p-6">
        <h3 className="text-base font-semibold">Histórico recente de envios</h3>
        <p className="text-sm text-muted-foreground">
          Apenas metadados (tipo, destinatários, status e resumo de erro). Sem corpo nem anexos.
        </p>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Destinatários</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tentativas</TableHead>
                <TableHead>Erro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    Nenhum envio registrado ainda.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(log.createdAt)}</TableCell>
                    <TableCell>{log.type}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{log.recipients}</TableCell>
                    <TableCell>{log.status}</TableCell>
                    <TableCell>{log.attempts}</TableCell>
                    <TableCell className="max-w-[280px] truncate text-muted-foreground">
                      {log.errorSummary || "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
