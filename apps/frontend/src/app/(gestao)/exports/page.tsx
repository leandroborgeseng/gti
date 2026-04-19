"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import {
  fetchContractAmendmentsCsvBlob,
  fetchContractsCsvBlob,
  fetchGlosasCsvBlob,
  fetchMeasurementsCsvBlob,
  getAuthMe
} from "@/lib/api";
import { formatLoadError } from "@/lib/api-load";

type ExportKind = "contracts" | "measurements" | "glosas" | "amendments";

type AuthState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; role: string };

export default function ExportsPage(): JSX.Element {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void getAuthMe()
      .then((m) => setAuth({ status: "ok", role: m.role }))
      .catch((e) => setAuth({ status: "error", message: formatLoadError(e) }));
  }, []);

  const download = useCallback(async (kind: ExportKind, fetcher: () => Promise<Blob>, filename: string) => {
    setBusy(kind);
    setMsg(null);
    try {
      const blob = await fetcher();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setMsg(`Ficheiro «${filename}» transferido.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha na exportação");
    } finally {
      setBusy(null);
    }
  }, []);

  if (auth.status === "loading") {
    return (
      <Card className="p-6">
        <p className="text-sm text-slate-600">A carregar…</p>
      </Card>
    );
  }

  if (auth.status === "error") {
    return (
      <Card className="space-y-4 p-6">
        <h1 className="text-lg font-semibold text-slate-900">Exportações</h1>
        <DataLoadAlert messages={[auth.message]} title="Não foi possível confirmar a sessão" />
      </Card>
    );
  }

  const { role } = auth;
  if (role !== "ADMIN" && role !== "EDITOR") {
    return (
      <Card className="p-6">
        <h1 className="text-lg font-semibold text-slate-900">Exportações</h1>
        <p className="mt-2 text-sm text-slate-600">Disponível para perfis de edição ou administrador.</p>
      </Card>
    );
  }

  const btnClass =
    "mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800 disabled:opacity-60";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Exportações</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Descarregue dados em CSV para arquivo ou análise externa. Os ficheiros usam UTF-8 com BOM (compatível com Excel).
        </p>
      </div>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">Contratos</h2>
        <p className="mt-1 text-sm text-slate-600">
          Uma linha por contrato ativo (não eliminado), com número, fornecedor, tipo, vigência e valores.
        </p>
        <button
          type="button"
          disabled={busy !== null}
          className={btnClass}
          onClick={() => void download("contracts", fetchContractsCsvBlob, "contratos.csv")}
        >
          {busy === "contracts" ? "A gerar…" : "Descarregar contratos.csv"}
        </button>
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">Aditivos de contratos</h2>
        <p className="mt-1 text-sm text-slate-600">
          Histórico de aditivos e reajustes (valores e vigência), com ligação ao contrato.
        </p>
        <button
          type="button"
          disabled={busy !== null}
          className={btnClass}
          onClick={() => void download("amendments", fetchContractAmendmentsCsvBlob, "aditivos-contratos.csv")}
        >
          {busy === "amendments" ? "A gerar…" : "Descarregar aditivos-contratos.csv"}
        </button>
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">Medições</h2>
        <p className="mt-1 text-sm text-slate-600">
          Todas as medições não eliminadas, com referência, estado e valores agregados.
        </p>
        <button
          type="button"
          disabled={busy !== null}
          className={btnClass}
          onClick={() => void download("measurements", fetchMeasurementsCsvBlob, "medicoes.csv")}
        >
          {busy === "measurements" ? "A gerar…" : "Descarregar medicoes.csv"}
        </button>
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">Glosas</h2>
        <p className="mt-1 text-sm text-slate-600">Registos de glosa com ligação à competência e ao contrato (via medição).</p>
        <button
          type="button"
          disabled={busy !== null}
          className={btnClass}
          onClick={() => void download("glosas", fetchGlosasCsvBlob, "glosas.csv")}
        >
          {busy === "glosas" ? "A gerar…" : "Descarregar glosas.csv"}
        </button>
      </Card>

      {msg ? <p className="text-sm text-slate-600">{msg}</p> : null}
    </div>
  );
}
