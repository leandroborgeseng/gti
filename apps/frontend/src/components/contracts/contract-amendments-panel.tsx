"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AuthMe, Contract } from "@/lib/api";
import { createContractAmendment, getAuthMe } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { formatBrl } from "@/lib/format-brl";

function toDateInputValue(iso: string): string {
  const s = String(iso);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function formatDatePt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("pt-BR");
}

/** Data local no formato YYYY-MM-DD (para input type="date"). */
function todayDateInputValue(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function ContractAmendmentsPanel(props: { contract: Contract }): JSX.Element {
  const router = useRouter();
  const [role, setRole] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    void getAuthMe()
      .then((m: AuthMe) => setRole(m.role))
      .catch(() => setRole(null));
  }, []);

  const canEdit = role === "ADMIN" || role === "EDITOR";
  const contractActive = props.contract.status === "ACTIVE";
  const list = props.contract.amendments ?? [];

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canEdit) return;
    const fd = new FormData(event.currentTarget);
    const description = String(fd.get("description") ?? "").trim();
    const effectiveDate = String(fd.get("effectiveDate") ?? "").trim();
    const newEndDate = String(fd.get("newEndDate") ?? "").trim();
    const refRaw = String(fd.get("referenceCode") ?? "").trim();
    const newTotalValue = Number(String(fd.get("newTotalValue") ?? "").replace(",", "."));
    const newMonthlyValue = Number(String(fd.get("newMonthlyValue") ?? "").replace(",", "."));
    if (!description) {
      setErr("Descreva o motivo ou objeto do aditivo.");
      return;
    }
    if (!effectiveDate || !newEndDate) {
      setErr("Indique as datas de vigência do aditivo e o novo término do contrato.");
      return;
    }
    if (!Number.isFinite(newTotalValue) || !Number.isFinite(newMonthlyValue) || newTotalValue < 0 || newMonthlyValue < 0) {
      setErr("Valores inválidos.");
      return;
    }
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      await createContractAmendment(props.contract.id, {
        referenceCode: refRaw || undefined,
        effectiveDate,
        description,
        newTotalValue,
        newMonthlyValue,
        newEndDate
      });
      setOk("Aditivo registado e valores do contrato atualizados.");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível registar o aditivo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold text-slate-900">Aditivos e reajustes</h2>
      <p className="mt-1 text-sm text-slate-600">
        Registo formal de alteração de <strong className="font-medium text-slate-800">valor total</strong>,{" "}
        <strong className="font-medium text-slate-800">valor mensal</strong> e{" "}
        <strong className="font-medium text-slate-800">data de término</strong>. Os novos valores passam a vigorar de imediato no
        contrato.
      </p>

      {role === undefined ? (
        <p className="mt-4 text-sm text-slate-500">A carregar permissões…</p>
      ) : canEdit && !contractActive ? (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Só é possível registar novos aditivos com o contrato em estado <strong className="font-medium">Ativo</strong>. Altere o
          estado do contrato antes de continuar, se aplicável.
        </p>
      ) : canEdit ? (
        <form
          key={`${props.contract.id}-${props.contract.totalValue}-${props.contract.endDate}-${list.length}`}
          className="mt-4 grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-2"
          onSubmit={(e) => void onSubmit(e)}
        >
          <label className="grid gap-1 text-sm md:col-span-2">
            <span className="font-medium text-slate-700">Referência do instrumento (opcional)</span>
            <input
              name="referenceCode"
              type="text"
              className="rounded-md border border-slate-200 px-3 py-2 text-sm"
              placeholder="Ex.: 1º termo aditivo, SEI nº …"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">Data de vigência do aditivo</span>
            <input
              name="effectiveDate"
              type="date"
              required
              defaultValue={todayDateInputValue()}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">Novo término do contrato</span>
            <input
              name="newEndDate"
              type="date"
              required
              defaultValue={toDateInputValue(props.contract.endDate)}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">Novo valor total (R$)</span>
            <input
              name="newTotalValue"
              type="number"
              min={0}
              step="0.01"
              required
              defaultValue={Number(String(props.contract.totalValue).replace(",", ".")) || 0}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm tabular-nums"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">Novo valor mensal (R$)</span>
            <input
              name="newMonthlyValue"
              type="number"
              min={0}
              step="0.01"
              required
              defaultValue={Number(String(props.contract.monthlyValue).replace(",", ".")) || 0}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm tabular-nums"
            />
          </label>
          <label className="grid gap-1 text-sm md:col-span-2">
            <span className="font-medium text-slate-700">Descrição / objeto</span>
            <textarea
              name="description"
              required
              rows={3}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm"
              placeholder="Resumo do que foi alterado e fundamentação."
            />
          </label>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {busy ? "A gravar…" : "Registar aditivo e aplicar"}
            </button>
          </div>
        </form>
      ) : (
        <p className="mt-4 text-sm text-slate-600">O seu perfil só permite consultar o histórico de aditivos.</p>
      )}

      {err ? (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {err}
        </p>
      ) : null}
      {ok ? (
        <p className="mt-3 text-sm text-emerald-800" role="status">
          {ok}
        </p>
      ) : null}

      {list.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">Ainda não existem aditivos registados para este contrato.</p>
      ) : (
        <ul className="mt-6 divide-y divide-slate-100 rounded-md border border-slate-200">
          {list.map((a) => (
            <li key={a.id} className="px-3 py-3 text-sm text-slate-700">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-slate-900">{formatDatePt(a.effectiveDate)}</span>
                {a.referenceCode ? <span className="text-xs text-slate-500">{a.referenceCode}</span> : null}
              </div>
              <p className="mt-1 text-slate-600">{a.description}</p>
              <p className="mt-2 text-xs text-slate-500">
                Mensal: {formatBrl(a.previousMonthlyValue)} → {formatBrl(a.newMonthlyValue)} · Total: {formatBrl(a.previousTotalValue)} →{" "}
                {formatBrl(a.newTotalValue)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Término: {formatDatePt(a.previousEndDate)} → {formatDatePt(a.newEndDate)} · Registo em {formatDatePt(a.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
