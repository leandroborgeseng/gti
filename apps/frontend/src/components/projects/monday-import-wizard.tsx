"use client";

import { useCallback, useMemo, useState } from "react";
import type { MondayImportPayload } from "@/lib/monday-xlsx-import";
import { buildMondayImportWarnings, countMondayImportRootTasks, parseMondayExportWorkbook } from "@/lib/monday-xlsx-import";
import { importProjectMonday } from "@/lib/api";
import { Modal } from "@/components/ui/modal";
import { FormField, PrimaryButton, SecondaryButton, formControlClass } from "@/components/ui/form-primitives";

function PreviewTaskNode({ node, depth }: { node: MondayImportPayload["groups"][number]["tasks"][number]; depth: number }): JSX.Element {
  return (
    <li className={`text-sm ${depth > 0 ? "ml-4 mt-1 border-l border-slate-200 pl-3" : "mt-2"}`}>
      <span className="font-medium text-slate-900">{node.title}</span>
      {node.status ? <span className="ml-2 text-slate-500">· {node.status}</span> : null}
      {node.assigneeExternal ? <span className="ml-2 text-slate-600">({node.assigneeExternal})</span> : null}
      {node.dueDate ? (
        <span className="ml-2 tabular-nums text-slate-500">{new Date(node.dueDate).toLocaleDateString("pt-BR")}</span>
      ) : null}
      {node.effort != null ? <span className="ml-2 text-slate-600">esforço: {node.effort}</span> : null}
      {node.internalResponsible ? <span className="ml-2 text-slate-600">PMF: {node.internalResponsible}</span> : null}
      {node.children?.length ? (
        <ul className="mt-1 list-none space-y-0.5">
          {node.children.map((c, i) => (
            <PreviewTaskNode key={`${c.title}-${i}`} node={c} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
};

export function MondayImportWizard({ open, onClose, onImported }: Props): JSX.Element {
  const [step, setStep] = useState<"pick" | "preview">("pick");
  const [fileName, setFileName] = useState("");
  const [payload, setPayload] = useState<MondayImportPayload | null>(null);
  const [projectTitle, setProjectTitle] = useState("");
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep("pick");
    setFileName("");
    setPayload(null);
    setProjectTitle("");
    setParseErr(null);
    setBusy(false);
    setStatus(null);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const onFile = useCallback((file: File | null) => {
    setParseErr(null);
    setStatus(null);
    setPayload(null);
    if (!file) return;
    const name = file.name || "import.xlsx";
    setFileName(name);
    void file.arrayBuffer().then((buf) => {
      try {
        const data = parseMondayExportWorkbook(buf, name);
        setPayload(data);
        setProjectTitle(data.name);
        setStep("preview");
      } catch (e) {
        setParseErr(e instanceof Error ? e.message : "Não foi possível ler o Excel.");
      }
    });
  }, []);

  const importWarnings = useMemo(() => (payload ? buildMondayImportWarnings(payload) : []), [payload]);

  const confirmImport = useCallback(async () => {
    if (!payload) return;
    const nTasks = countMondayImportRootTasks(payload);
    if (nTasks === 0) {
      setStatus("Não há tarefas na pré-visualização. Escolha outro ficheiro ou confirme que o Excel tem a linha de cabeçalho (Name, Status, …).");
      return;
    }
    const name = projectTitle.trim() || payload.name;
    setBusy(true);
    setStatus(null);
    try {
      await importProjectMonday({ ...payload, name });
      setStatus("Projeto importado com sucesso.");
      onImported();
      handleClose();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Falha na importação.");
    } finally {
      setBusy(false);
    }
  }, [payload, projectTitle, onImported, handleClose]);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Importar Excel (Monday.com)"
      description="Cada folha do ficheiro vira um grupo (quadro kanban). Colunas: Name, Status, Pessoa, Data, Observação, Subelementos, Subelementos Status, Números, Resp. PMF."
    >
      <div className="space-y-4">
        {step === "pick" ? (
          <>
            <FormField label="Ficheiro .xlsx" htmlFor="monday-file">
              <input
                id="monday-file"
                type="file"
                accept=".xlsx,.xls,.xlsm"
                className={formControlClass}
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
            </FormField>
            {parseErr ? <p className="text-sm text-amber-800">{parseErr}</p> : null}
          </>
        ) : (
          <>
            <FormField label="Nome do projeto" htmlFor="proj-name" required>
              <input
                id="proj-name"
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                className={formControlClass}
                placeholder="Por omissão: nome do ficheiro sem extensão"
              />
            </FormField>
            {importWarnings.length > 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                <p className="font-semibold">Avisos antes de importar</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {importWarnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="max-h-[50vh] overflow-y-auto rounded-md border border-slate-200 bg-slate-50/80 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pré-visualização</p>
              <p className="mt-1 text-xs text-slate-600">
                Ficheiro: <span className="font-medium text-slate-800">{fileName}</span>
                {payload ? (
                  <>
                    {" "}
                    ·{" "}
                    <span className="font-medium text-slate-800">
                      {countMondayImportRootTasks(payload)} tarefa(s) na raiz
                    </span>
                  </>
                ) : null}
              </p>
              {payload?.groups.map((g) => (
                <div key={g.name} className="mt-4 border-t border-slate-200 pt-3 first:border-t-0 first:pt-0">
                  <p className="text-sm font-semibold text-slate-900">Grupo: {g.name}</p>
                  <p className="text-xs text-slate-500">
                    {g.tasks.length} tarefa(s) na raiz
                    {g.tasks.some((t) => t.children?.length) ? " (com subtarefas)" : ""}
                  </p>
                  <ul className="mt-2 list-none">
                    {g.tasks.map((t, i) => (
                      <PreviewTaskNode key={`${g.name}-${t.title}-${i}`} node={t} depth={0} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            {status ? <p className="text-sm text-slate-700">{status}</p> : null}
            <div className="flex flex-wrap gap-2">
              <SecondaryButton type="button" onClick={() => setStep("pick")}>
                Escolher outro ficheiro
              </SecondaryButton>
              <PrimaryButton type="button" busy={busy} onClick={() => void confirmImport()}>
                Confirmar importação
              </PrimaryButton>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
