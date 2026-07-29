"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import {
  fetchSystemBackupBlob,
  getAuthMe,
  getS3BackupStatus,
  getSystemBackupInfo,
  importSystemBackup,
  listS3BackupObjects,
  restoreS3Backup,
  runS3BackupNow,
  saveS3BackupConfig,
  type S3BackupObjectItem,
  type S3BackupStatus,
  type SystemBackupInfo
} from "@/lib/api";
import { formatLoadError } from "@/lib/api-load";
import { BACKUP_RESTORE_CONFIRM_PHRASE } from "@/lib/system-backup-constants";

type AuthState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; role: string };

type Busy =
  | "export-full"
  | "export-db"
  | "import"
  | "s3-save"
  | "s3-run"
  | "s3-restore"
  | "s3-list"
  | null;

type S3Form = {
  enabled: boolean;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: string;
  hour: number;
  timezone: string;
  keepDaily: number;
  keepWeekly: number;
  keepMonthly: number;
  endpoint: string;
  forcePathStyle: boolean;
};

function emptyS3Form(): S3Form {
  return {
    enabled: false,
    bucket: "",
    region: "",
    accessKeyId: "",
    secretAccessKey: "",
    prefix: "gti/backups",
    hour: 3,
    timezone: "America/Sao_Paulo",
    keepDaily: 7,
    keepWeekly: 5,
    keepMonthly: 12,
    endpoint: "",
    forcePathStyle: true
  };
}

function formFromStatus(status: S3BackupStatus): S3Form {
  return {
    enabled: status.enabled,
    bucket: status.bucket || "",
    region: status.region || "",
    accessKeyId: status.accessKeyId || "",
    secretAccessKey: "",
    prefix: status.prefix || "gti/backups",
    hour: status.hour,
    timezone: status.timezone || "America/Sao_Paulo",
    keepDaily: status.keepDaily,
    keepWeekly: status.keepWeekly,
    keepMonthly: status.keepMonthly,
    endpoint: status.endpoint || "",
    forcePathStyle: status.forcePathStyle
  };
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(status: S3BackupStatus["status"]): string {
  switch (status) {
    case "ativo":
      return "Ativo";
    case "em_execucao":
      return "Em execução";
    case "incompleto":
      return "Incompleto";
    default:
      return "Desabilitado";
  }
}

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-60";
const btnClass =
  "rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800 disabled:opacity-60";
const btnSecondaryClass =
  "rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60";
const btnDangerClass =
  "rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-800 disabled:opacity-60";

export default function BackupPage(): JSX.Element {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  const [info, setInfo] = useState<SystemBackupInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [restoreUploads, setRestoreUploads] = useState(true);
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const [s3Status, setS3Status] = useState<S3BackupStatus | null>(null);
  const [s3Form, setS3Form] = useState<S3Form>(emptyS3Form());
  const [s3Error, setS3Error] = useState<string | null>(null);
  const [objects, setObjects] = useState<S3BackupObjectItem[]>([]);
  const [restoreKey, setRestoreKey] = useState("");
  const [s3Confirm, setS3Confirm] = useState("");
  const [s3RestoreUploads, setS3RestoreUploads] = useState(true);

  useEffect(() => {
    void getAuthMe()
      .then((m) => setAuth({ status: "ok", role: m.role }))
      .catch((e) => setAuth({ status: "error", message: formatLoadError(e) }));
  }, []);

  const loadS3 = useCallback(async () => {
    try {
      const status = await getS3BackupStatus();
      setS3Status(status);
      setS3Form(formFromStatus(status));
      setS3Error(null);
      return status;
    } catch (e) {
      setS3Error(formatLoadError(e));
      return null;
    }
  }, []);

  const loadObjects = useCallback(async () => {
    setBusy("s3-list");
    try {
      const result = await listS3BackupObjects();
      setObjects(result.items);
      setRestoreKey((prev) => prev || result.items[0]?.key || "");
    } catch {
      setObjects([]);
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    if (auth.status !== "ok" || auth.role !== "ADMIN") return;
    void getSystemBackupInfo()
      .then((data) => {
        setInfo(data);
        setInfoError(null);
      })
      .catch((e) => setInfoError(formatLoadError(e)));
    void loadS3().then((status) => {
      if (status?.configured && status.hasSecret) {
        void loadObjects();
      }
    });
  }, [auth, loadS3, loadObjects]);

  const setS3Field = <K extends keyof S3Form>(key: K, value: S3Form[K]) => {
    setS3Form((prev) => ({ ...prev, [key]: value }));
  };

  const download = useCallback(async (withUploads: boolean) => {
    setBusy(withUploads ? "export-full" : "export-db");
    setMsg(null);
    setImportWarnings([]);
    try {
      const { blob, filename } = await fetchSystemBackupBlob(withUploads);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setMsg(`Pacote «${filename}» transferido. Guarde-o em local seguro.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha na exportação");
    } finally {
      setBusy(null);
    }
  }, []);

  const onImport = useCallback(async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setMsg("Selecione o ficheiro .tar.gz de backup.");
      return;
    }
    setBusy("import");
    setMsg(null);
    setImportWarnings([]);
    try {
      const result = await importSystemBackup(file, {
        confirm: confirmPhrase,
        restoreUploads
      });
      setMsg(result.message);
      setImportWarnings(result.warnings ?? []);
      setConfirmPhrase("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha na importação");
    } finally {
      setBusy(null);
    }
  }, [confirmPhrase, restoreUploads]);

  const onS3Save = useCallback(async () => {
    setBusy("s3-save");
    setMsg(null);
    try {
      const status = await saveS3BackupConfig({
        enabled: s3Form.enabled,
        bucket: s3Form.bucket,
        region: s3Form.region,
        accessKeyId: s3Form.accessKeyId,
        secretAccessKey: s3Form.secretAccessKey || undefined,
        prefix: s3Form.prefix || "gti/backups",
        hour: s3Form.hour,
        timezone: s3Form.timezone || "America/Sao_Paulo",
        keepDaily: s3Form.keepDaily,
        keepWeekly: s3Form.keepWeekly,
        keepMonthly: s3Form.keepMonthly,
        endpoint: s3Form.endpoint || null,
        forcePathStyle: s3Form.forcePathStyle
      });
      setS3Status(status);
      setS3Form(formFromStatus(status));
      setMsg("Configuração de backup S3 salva.");
      if (status.configured && status.hasSecret) {
        void loadObjects();
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao salvar S3");
    } finally {
      setBusy(null);
    }
  }, [s3Form, loadObjects]);

  const onS3Run = useCallback(async () => {
    setBusy("s3-run");
    setMsg(null);
    try {
      const lastRun = await runS3BackupNow();
      setMsg(
        lastRun.ok
          ? `Backup S3 enviado (${formatBytes(lastRun.bytes)}${lastRun.objectKey ? ` · ${lastRun.objectKey}` : ""}).`
          : `Backup S3 falhou: ${lastRun.error ?? "erro desconhecido"}`
      );
      await loadS3();
      await loadObjects();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha no backup S3");
      await loadS3();
    } finally {
      setBusy(null);
    }
  }, [loadS3, loadObjects]);

  const onS3Restore = useCallback(async () => {
    if (!restoreKey) {
      setMsg("Selecione um backup no S3.");
      return;
    }
    setBusy("s3-restore");
    setMsg(null);
    setImportWarnings([]);
    try {
      const result = await restoreS3Backup({
        objectKey: restoreKey,
        confirm: s3Confirm,
        restoreUploads: s3RestoreUploads
      });
      setMsg(result.message);
      setImportWarnings(result.warnings ?? []);
      setS3Confirm("");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao restaurar do S3");
    } finally {
      setBusy(null);
    }
  }, [restoreKey, s3Confirm, s3RestoreUploads]);

  if (auth.status === "loading") {
    return (
      <Card className="p-6">
        <p className="text-sm text-slate-600">Carregando…</p>
      </Card>
    );
  }

  if (auth.status === "error") {
    return (
      <Card className="space-y-4 p-6">
        <h1 className="text-lg font-semibold text-slate-900">Backup e migração</h1>
        <DataLoadAlert messages={[auth.message]} title="Não foi possível confirmar a sessão" />
      </Card>
    );
  }

  if (auth.role !== "ADMIN") {
    return (
      <Card className="p-6">
        <h1 className="text-lg font-semibold text-slate-900">Backup e migração</h1>
        <p className="mt-2 text-sm text-slate-600">
          Esta área é reservada a perfis <strong className="font-medium text-slate-800">ADMIN</strong>.
        </p>
      </Card>
    );
  }

  const phrase = info?.confirmPhrase ?? BACKUP_RESTORE_CONFIRM_PHRASE;
  const missingEnv = info?.envChecklist.filter((i) => !i.present) ?? [];
  const locked = busy !== null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Backup e migração</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Exporte, restaure ou agende cópias automáticas no S3 (AWS, MinIO, Cloudflare R2…). Segredos de ambiente da
          aplicação não entram no pacote.
        </p>
      </div>

      {infoError ? <DataLoadAlert messages={[infoError]} title="Metadados do backup" /> : null}
      {s3Error ? <DataLoadAlert messages={[s3Error]} title="Configuração S3" /> : null}

      <Card className="space-y-4 p-5">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Backup automático (S3)</h2>
          <p className="mt-1 text-sm text-slate-600">
            Envio diário do pacote completo (base + anexos), com retenção diária / semanal (domingo) / mensal (dia 1).
            Configure pela interface — não é necessário editar ficheiros no servidor.
          </p>
        </div>

        {!s3Status ? (
          <p className="text-sm text-slate-500">Carregando configuração S3…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={s3Form.enabled}
                  onChange={(e) => setS3Field("enabled", e.target.checked)}
                  disabled={locked}
                />
                Ativar backup diário automático
              </label>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  s3Status.status === "ativo"
                    ? "bg-emerald-100 text-emerald-800"
                    : s3Status.status === "em_execucao"
                      ? "bg-sky-100 text-sky-800"
                      : s3Status.status === "incompleto"
                        ? "bg-amber-100 text-amber-900"
                        : "bg-slate-100 text-slate-700"
                }`}
              >
                {statusLabel(s3Status.status)}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-slate-600">
                Nome do bucket
                <input
                  className={inputClass}
                  value={s3Form.bucket}
                  onChange={(e) => setS3Field("bucket", e.target.value)}
                  placeholder="meu-bucket-gti"
                  disabled={locked}
                  autoComplete="off"
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Região
                <input
                  className={inputClass}
                  value={s3Form.region}
                  onChange={(e) => setS3Field("region", e.target.value)}
                  placeholder="us-east-1"
                  disabled={locked}
                  autoComplete="off"
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Access Key ID
                <input
                  className={`${inputClass} font-mono`}
                  value={s3Form.accessKeyId}
                  onChange={(e) => setS3Field("accessKeyId", e.target.value)}
                  placeholder="AKIA…"
                  disabled={locked}
                  autoComplete="off"
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Secret Access Key
                <input
                  className={`${inputClass} font-mono`}
                  type="password"
                  value={s3Form.secretAccessKey}
                  onChange={(e) => setS3Field("secretAccessKey", e.target.value)}
                  placeholder={
                    s3Status.hasSecret ? "•••••••• (deixe em branco para manter)" : "Cole a chave secreta"
                  }
                  disabled={locked}
                  autoComplete="new-password"
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Pasta no bucket (prefixo)
                <input
                  className={`${inputClass} font-mono`}
                  value={s3Form.prefix}
                  onChange={(e) => setS3Field("prefix", e.target.value)}
                  placeholder="gti/backups"
                  disabled={locked}
                  autoComplete="off"
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Horário do backup diário
                <select
                  className={inputClass}
                  value={s3Form.hour}
                  onChange={(e) => setS3Field("hour", Number(e.target.value))}
                  disabled={locked}
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, "0")}:00
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
              <p className="text-sm font-semibold text-slate-900">Retenção de backups</p>
              <p className="mt-1 text-xs text-slate-500">
                Quantos ficheiros manter no S3. Os mais antigos de cada tipo são apagados automaticamente.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="block text-xs font-medium text-slate-600">
                  Cópias diárias
                  <input
                    className={inputClass}
                    type="number"
                    min={1}
                    max={90}
                    value={s3Form.keepDaily}
                    onChange={(e) => setS3Field("keepDaily", Number(e.target.value) || 7)}
                    disabled={locked}
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Cópias semanais
                  <input
                    className={inputClass}
                    type="number"
                    min={1}
                    max={52}
                    value={s3Form.keepWeekly}
                    onChange={(e) => setS3Field("keepWeekly", Number(e.target.value) || 5)}
                    disabled={locked}
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Cópias mensais
                  <input
                    className={inputClass}
                    type="number"
                    min={1}
                    max={120}
                    value={s3Form.keepMonthly}
                    onChange={(e) => setS3Field("keepMonthly", Number(e.target.value) || 12)}
                    disabled={locked}
                  />
                </label>
              </div>
            </div>

            <details className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">
                Opções avançadas (endpoint, fuso)
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
                  Endpoint (MinIO / R2 — opcional)
                  <input
                    className={`${inputClass} font-mono`}
                    value={s3Form.endpoint}
                    onChange={(e) => setS3Field("endpoint", e.target.value)}
                    placeholder="https://….r2.cloudflarestorage.com"
                    disabled={locked}
                    autoComplete="off"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Fuso horário
                  <input
                    className={`${inputClass} font-mono`}
                    value={s3Form.timezone}
                    onChange={(e) => setS3Field("timezone", e.target.value)}
                    placeholder="America/Sao_Paulo"
                    disabled={locked}
                    autoComplete="off"
                  />
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-slate-700 sm:col-span-3">
                  <input
                    type="checkbox"
                    checked={s3Form.forcePathStyle}
                    onChange={(e) => setS3Field("forcePathStyle", e.target.checked)}
                    disabled={locked}
                  />
                  Path-style (recomendado para MinIO / endpoints compatíveis)
                </label>
              </div>
            </details>

            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {s3Status.lastRun ? (
                <p>
                  Última execução: {new Date(s3Status.lastRun.at).toLocaleString("pt-BR")} ·{" "}
                  {s3Status.lastRun.ok ? "sucesso" : "erro"} ({s3Status.lastRun.triggeredBy})
                  {s3Status.lastRun.bytes != null ? ` · ${formatBytes(s3Status.lastRun.bytes)}` : ""}
                  {s3Status.lastRun.error ? ` — ${s3Status.lastRun.error}` : ""}
                </p>
              ) : (
                <p>Ainda não houve execução registada.</p>
              )}
              <p className="mt-1">
                Agendamento: todos os dias às {String(s3Form.hour).padStart(2, "0")}:00 ({s3Form.timezone})
                {s3Status.cronRegistered ? " · cron ativo neste processo" : " · cron ainda não registado"}. No domingo
                também grava semanal; no dia 1, mensal.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnClass} disabled={locked} onClick={() => void onS3Save()}>
                {busy === "s3-save" ? "Salvando…" : "Salvar configuração"}
              </button>
              <button
                type="button"
                className={btnSecondaryClass}
                disabled={locked || !s3Status.enabled || !s3Status.configured || s3Status.running}
                onClick={() => void onS3Run()}
              >
                {busy === "s3-run" || s3Status.running ? "Enviando backup…" : "Executar backup agora"}
              </button>
            </div>
          </>
        )}
      </Card>

      <Card className="space-y-3 border-amber-100 p-5">
        <h2 className="text-base font-semibold text-slate-900">Restaurar a partir do S3</h2>
        <p className="text-sm text-slate-600">
          Lista os pacotes no bucket (diários, semanais e mensais) e restaura um deles neste servidor. Digite{" "}
          <strong className="font-semibold text-slate-800">{phrase}</strong> para confirmar.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={btnSecondaryClass}
            disabled={locked || !s3Status?.configured}
            onClick={() => void loadObjects()}
          >
            {busy === "s3-list" ? "Atualizando…" : "Atualizar lista"}
          </button>
        </div>
        <label className="block text-xs font-medium text-slate-600">
          Backup no S3
          <select
            className={inputClass}
            value={restoreKey}
            onChange={(e) => setRestoreKey(e.target.value)}
            disabled={locked || objects.length === 0}
          >
            {objects.length === 0 ? (
              <option value="">Nenhum objeto listado</option>
            ) : (
              objects.map((o) => (
                <option key={o.key} value={o.key}>
                  [{o.tier}] {o.key} · {formatBytes(o.size)}
                  {o.lastModified ? ` · ${new Date(o.lastModified).toLocaleString("pt-BR")}` : ""}
                </option>
              ))
            )}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={s3RestoreUploads}
            onChange={(e) => setS3RestoreUploads(e.target.checked)}
            disabled={locked}
          />
          Restaurar anexos do pacote
        </label>
        <div>
          <label htmlFor="s3-confirm" className="block text-sm font-medium text-slate-700">
            Confirmação
          </label>
          <input
            id="s3-confirm"
            type="text"
            autoComplete="off"
            value={s3Confirm}
            onChange={(e) => setS3Confirm(e.target.value)}
            disabled={locked}
            placeholder={phrase}
            className={`max-w-xs ${inputClass}`}
          />
        </div>
        <button
          type="button"
          className={btnDangerClass}
          disabled={locked || !restoreKey || s3Confirm.trim().toUpperCase() !== phrase}
          onClick={() => void onS3Restore()}
        >
          {busy === "s3-restore" ? "Restaurando…" : "Restaurar do S3"}
        </button>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="text-base font-semibold text-slate-900">Exportar</h2>
        <p className="text-sm text-slate-600">
          Gera um arquivo <code className="rounded bg-slate-100 px-1 text-xs">.tar.gz</code> com dump PostgreSQL,
          manifesto e checklist de variáveis.
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={locked} className={btnClass} onClick={() => void download(true)}>
            {busy === "export-full" ? "Gerando pacote…" : "Baixar backup com anexos"}
          </button>
          <button type="button" disabled={locked} className={btnSecondaryClass} onClick={() => void download(false)}>
            {busy === "export-db" ? "Gerando…" : "Baixar só base de dados"}
          </button>
        </div>
      </Card>

      <Card className="space-y-3 border-red-100 p-5">
        <h2 className="text-base font-semibold text-slate-900">Importar / restaurar ficheiro</h2>
        <p className="text-sm text-slate-600">
          Substitui os dados da base neste servidor. Digite <strong className="font-semibold">{phrase}</strong> para
          confirmar.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".tar.gz,.tgz,.dump,.gti-backup,application/gzip,application/x-gzip"
          disabled={locked}
          className="block w-full max-w-lg text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium"
        />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={restoreUploads}
            onChange={(e) => setRestoreUploads(e.target.checked)}
            disabled={locked}
          />
          Restaurar anexos do pacote (se existirem)
        </label>
        <div>
          <label htmlFor="backup-confirm" className="block text-sm font-medium text-slate-700">
            Confirmação
          </label>
          <input
            id="backup-confirm"
            type="text"
            autoComplete="off"
            value={confirmPhrase}
            onChange={(e) => setConfirmPhrase(e.target.value)}
            disabled={locked}
            placeholder={phrase}
            className={`max-w-xs ${inputClass}`}
          />
        </div>
        <button
          type="button"
          disabled={locked || confirmPhrase.trim().toUpperCase() !== phrase}
          className={btnDangerClass}
          onClick={() => void onImport()}
        >
          {busy === "import" ? "Restaurando…" : "Restaurar ficheiro"}
        </button>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="text-base font-semibold text-slate-900">Variáveis de ambiente neste servidor</h2>
        <p className="text-sm text-slate-600">
          Apenas indica se a variável está definida. Limite de upload de backup: {info?.maxUploadMb ?? "…"} MB.
        </p>
        {info ? (
          <ul className="grid max-w-3xl gap-1 sm:grid-cols-2">
            {info.envChecklist.map((item) => (
              <li key={item.key} className="flex items-center gap-2 text-sm">
                <span
                  className={
                    item.present
                      ? "inline-block h-2 w-2 rounded-full bg-emerald-500"
                      : "inline-block h-2 w-2 rounded-full bg-amber-500"
                  }
                />
                <code className="text-xs text-slate-800">{item.key}</code>
                <span className="text-xs text-slate-500">{item.present ? "ok" : "em falta"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Carregando checklist…</p>
        )}
        {missingEnv.length > 0 ? (
          <p className="text-sm text-amber-800">
            Em falta: {missingEnv.map((i) => i.key).join(", ")}.
          </p>
        ) : null}
      </Card>

      {msg ? <p className="text-sm text-slate-700">{msg}</p> : null}
      {importWarnings.length > 0 ? (
        <Card className="space-y-2 border-amber-200 bg-amber-50 p-4">
          <h3 className="text-sm font-semibold text-amber-900">Avisos da restauração</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-900">
            {importWarnings.map((w) => (
              <li key={w.slice(0, 80)} className="break-words">
                {w}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
