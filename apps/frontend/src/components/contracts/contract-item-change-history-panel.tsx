import type { ContractItemChangeLog } from "@/lib/api";
import { Card } from "@/components/ui/card";

const actionLabel: Record<ContractItemChangeLog["action"], string> = {
  CREATED: "Inserido",
  DELETED: "Excluído",
  STATUS_CHANGED: "Status alterado",
  UPDATED: "Alterado",
  BULK_IMPORTED: "Importação em massa"
};

const itemTypeLabel: Record<ContractItemChangeLog["itemType"], string> = {
  MODULE: "Módulo",
  FEATURE: "Funcionalidade",
  SERVICE: "Serviço"
};

const featureStatusLabel: Record<string, string> = {
  NOT_STARTED: "Não iniciada",
  IN_PROGRESS: "Em progresso",
  DELIVERED: "Entregue",
  VALIDATED: "Validada"
};

const deliveryStatusLabel: Record<string, string> = {
  NOT_DELIVERED: "Não entregue",
  PARTIALLY_DELIVERED: "Parcial",
  DELIVERED: "Concluída"
};

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function statusText(value?: string | null, labels: Record<string, string> = {}): string {
  if (!value) return "sem status";
  return labels[value] ?? value;
}

function ChangeDetails({ log }: { log: ContractItemChangeLog }): JSX.Element | null {
  const statusChanged = log.statusBefore !== log.statusAfter && (log.statusBefore || log.statusAfter);
  const deliveryChanged =
    log.deliveryStatusBefore !== log.deliveryStatusAfter && (log.deliveryStatusBefore || log.deliveryStatusAfter);

  if (!statusChanged && !deliveryChanged) return null;

  return (
    <div className="mt-2 space-y-1 text-xs text-slate-600">
      {statusChanged ? (
        <p>
          Status: <strong>{statusText(log.statusBefore, featureStatusLabel)}</strong> →{" "}
          <strong>{statusText(log.statusAfter, featureStatusLabel)}</strong>
        </p>
      ) : null}
      {deliveryChanged ? (
        <p>
          Entrega: <strong>{statusText(log.deliveryStatusBefore, deliveryStatusLabel)}</strong> →{" "}
          <strong>{statusText(log.deliveryStatusAfter, deliveryStatusLabel)}</strong>
        </p>
      ) : null}
    </div>
  );
}

export function ContractItemChangeHistoryPanel({ logs = [] }: { logs?: ContractItemChangeLog[] }): JSX.Element {
  return (
    <Card className="p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Histórico auditável dos itens do contrato</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Registra inserções, exclusões e mudanças de status dos itens contratuais para apoiar validação antes de
            medições e pagamentos.
          </p>
        </div>
        <span className="text-xs text-slate-500">{logs.length} registro{logs.length === 1 ? "" : "s"}</span>
      </div>

      {logs.length === 0 ? (
        <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Nenhuma alteração de item registrada ainda. O histórico passa a ser preenchido a partir desta versão.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {logs.map((log) => (
            <li key={log.id} className="rounded-lg border border-slate-200 bg-white px-3 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                      {actionLabel[log.action] ?? log.action}
                    </span>
                    <span className="text-xs text-slate-500">{itemTypeLabel[log.itemType] ?? log.itemType}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-slate-900">{log.itemName}</p>
                </div>
                <span className="text-xs text-slate-500">{formatDateTime(log.changedAt)}</span>
              </div>
              <ChangeDetails log={log} />
              <p className="mt-2 text-xs text-slate-500">Alterado por: {log.actorLabel || "system"}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
