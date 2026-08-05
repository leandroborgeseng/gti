"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  getContractGlpiTickets,
  type ContractGlpiGroup,
  type ContractGlpiTicketsQuery
} from "@/lib/api";
import { buildGlpiTicketFrontUrl } from "@/lib/glpi-ticket-front-url";
import { queryKeys } from "@/lib/query-keys";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = {
  contractId: string;
  glpiGroups: ContractGlpiGroup[];
};

type SyncBanner = {
  lastSuccessAt: string | null;
  lastFinishedAt: string | null;
  isRunning: boolean;
  lastError: string | null;
};

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

export function ContractGlpiTicketsPanel({ contractId, glpiGroups }: Props): JSX.Element {
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [slaOverdue, setSlaOverdue] = useState(false);

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
    queryKey: ["glpi", "sync-status", "contract-panel"] as const,
    queryFn: fetchGlpiSyncBanner,
    staleTime: 60_000
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
        Lista somente leitura dos chamados sincronizados cujos grupos técnicos coincidem com os{" "}
        <strong>Grupos GLPI</strong> vinculados a este contrato. A classificação contratual complementar
        (campos locais além do GLPI) ainda não está disponível nesta tela.
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
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3 font-semibold">Nº</th>
                    <th className="py-2 pr-3 font-semibold">Título</th>
                    <th className="py-2 pr-3 font-semibold">Situação</th>
                    <th className="py-2 pr-3 font-semibold">Prioridade</th>
                    <th className="py-2 pr-3 font-semibold">Grupo</th>
                    <th className="py-2 pr-3 font-semibold">Abertura</th>
                    <th className="py-2 pr-3 font-semibold">SLA</th>
                    <th className="py-2 font-semibold">GLPI</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-4 text-slate-600">
                        Nenhum chamado encontrado para os grupos e filtros atuais.
                      </td>
                    </tr>
                  ) : (
                    tickets.map((t) => {
                      const href = buildGlpiTicketFrontUrl(t.glpiTicketId);
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
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
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
