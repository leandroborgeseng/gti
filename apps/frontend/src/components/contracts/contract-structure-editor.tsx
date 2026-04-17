"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import type { Contract } from "@/lib/api";
import {
  createContractFeature,
  createContractModule,
  createContractService,
  deleteContractFeature,
  deleteContractModule,
  deleteContractService,
  updateContractFeature,
  updateContractModule,
  updateContractService,
  type ContractFeatureStatus
} from "@/lib/api";
import {
  confirmWeightSumDeviation,
  formatWeightPt,
  parseContractWeight,
  projectContractModulesSum,
  projectModuleFeaturesSum,
  weightSumMatchesTarget
} from "@/lib/contract-weights";

const featureStatusLabels: Record<ContractFeatureStatus, string> = {
  NOT_STARTED: "Não iniciada",
  IN_PROGRESS: "Em progresso",
  DELIVERED: "Entregue",
  VALIDATED: "Validada"
};

const featureStatuses: ContractFeatureStatus[] = ["NOT_STARTED", "IN_PROGRESS", "DELIVERED", "VALIDATED"];

function showsModules(contractType: string): boolean {
  return ["SOFTWARE", "INFRA", "SERVICO"].includes(contractType);
}

function showsServices(contractType: string): boolean {
  return ["DATACENTER", "INFRA", "SERVICO"].includes(contractType);
}

type ModuleRow = NonNullable<Contract["modules"]>[number];

function ModuleWeightsSummary(props: { modules: ModuleRow[] }): JSX.Element {
  if (props.modules.length === 0) {
    return (
      <p className="mb-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600" role="status">
        Quando existir pelo menos um módulo, a <strong>soma dos pesos dos módulos</strong> deve ser <strong>1</strong> (com pequena tolerância
        numérica). O mesmo vale para as <strong>funcionalidades dentro de cada módulo</strong>.
      </p>
    );
  }
  const sum = projectContractModulesSum(props.modules);
  const ok = weightSumMatchesTarget(sum);
  return (
    <div
      className={`mb-4 rounded-md border px-3 py-2 text-sm ${ok ? "border-emerald-200 bg-emerald-50/90 text-emerald-950" : "border-amber-300 bg-amber-50 text-amber-950"}`}
      role="status"
      aria-live="polite"
    >
      <span className="font-medium">Soma dos pesos dos módulos:</span>{" "}
      <span className="tabular-nums font-semibold">{formatWeightPt(sum)}</span>
      {ok ? (
        <span className="ml-2 text-emerald-900">— alinhado à meta 1</span>
      ) : (
        <span className="ml-2">
          — fora da meta (esperado ≈ 1). Ajuste os pesos ou confirme ao gravar; o sistema pedirá confirmação se a soma continuar desalinhada.
        </span>
      )}
    </div>
  );
}

export function ContractStructureEditor(props: { contract: Contract }): JSX.Element {
  const [contract, setContract] = useState(props.contract);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cid = contract.id;

  async function run(op: () => Promise<Contract>): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const next = await op();
      setContract(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setBusy(false);
    }
  }

  const [newModName, setNewModName] = useState("");
  const [newModWeight, setNewModWeight] = useState("");

  const [newSvcName, setNewSvcName] = useState("");
  const [newSvcUnit, setNewSvcUnit] = useState("");
  const [newSvcValue, setNewSvcValue] = useState("");

  const modules = contract.modules ?? [];
  const services = contract.services ?? [];

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}
      {busy ? <p className="text-xs text-slate-500">A gravar…</p> : null}

      {showsModules(contract.contractType) ? (
        <Card>
          <h4 className="mb-3 font-medium text-slate-900">Módulos e funcionalidades</h4>
          <p className="mb-3 text-xs text-slate-500">
            Pesos são decimais (use ponto ou vírgula). A soma dos pesos dos módulos e, em cada módulo, a soma das funcionalidades deve ser{" "}
            <strong>1</strong> (tolerância numérica para arredondamentos).
          </p>
          <ModuleWeightsSummary modules={modules} />

          <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-4">
            <input
              className="min-w-[12rem] rounded border border-slate-300 px-2 py-1 text-sm"
              placeholder="Nome do módulo"
              value={newModName}
              onChange={(e) => setNewModName(e.target.value)}
              disabled={busy}
            />
            <input
              className="w-28 rounded border border-slate-300 px-2 py-1 text-sm"
              placeholder="Peso"
              type="number"
              step="0.0001"
              min={0}
              value={newModWeight}
              onChange={(e) => setNewModWeight(e.target.value)}
              disabled={busy}
            />
            <button
              type="button"
              className="rounded bg-slate-800 px-3 py-1 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
              disabled={busy || !newModName.trim()}
              onClick={() => {
                const w = parseContractWeight(newModWeight);
                if (!Number.isFinite(w)) {
                  setError("Indique um peso numérico válido.");
                  return;
                }
                const projected = projectContractModulesSum(modules) + w;
                if (!confirmWeightSumDeviation(projected, "Pesos dos módulos (após incluir este módulo)")) {
                  return;
                }
                void run(async () => {
                  const c = await createContractModule(cid, { name: newModName.trim(), weight: w });
                  setNewModName("");
                  setNewModWeight("");
                  return c;
                });
              }}
            >
              Adicionar módulo
            </button>
          </div>

          <div className="space-y-6">
            {modules.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum módulo. Adicione o primeiro acima.</p>
            ) : null}
            {modules.map((mod) => (
              <ModuleBlock
                key={mod.id}
                contractId={cid}
                module={mod}
                allModules={modules}
                busy={busy}
                onError={setError}
                onBusy={setBusy}
                onUpdated={setContract}
              />
            ))}
          </div>
        </Card>
      ) : null}

      {showsServices(contract.contractType) ? (
        <Card>
          <h4 className="mb-3 font-medium text-slate-900">Serviços (medição por quantidade)</h4>
          <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-200 pb-4">
            <input
              className="min-w-[10rem] rounded border border-slate-300 px-2 py-1 text-sm"
              placeholder="Nome do serviço"
              value={newSvcName}
              onChange={(e) => setNewSvcName(e.target.value)}
              disabled={busy}
            />
            <input
              className="w-24 rounded border border-slate-300 px-2 py-1 text-sm"
              placeholder="Unidade"
              value={newSvcUnit}
              onChange={(e) => setNewSvcUnit(e.target.value)}
              disabled={busy}
            />
            <input
              className="w-32 rounded border border-slate-300 px-2 py-1 text-sm"
              placeholder="Valor unitário"
              type="number"
              step="0.0001"
              min={0}
              value={newSvcValue}
              onChange={(e) => setNewSvcValue(e.target.value)}
              disabled={busy}
            />
            <button
              type="button"
              className="rounded bg-slate-800 px-3 py-1 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
              disabled={busy || !newSvcName.trim() || !newSvcUnit.trim()}
              onClick={() =>
                void run(async () => {
                  const v = Number(newSvcValue.replace(",", "."));
                  if (!Number.isFinite(v) || v < 0) {
                    throw new Error("Indique um valor unitário válido.");
                  }
                  const c = await createContractService(cid, {
                    name: newSvcName.trim(),
                    unit: newSvcUnit.trim(),
                    unitValue: v
                  });
                  setNewSvcName("");
                  setNewSvcUnit("");
                  setNewSvcValue("");
                  return c;
                })
              }
            >
              Adicionar serviço
            </button>
          </div>
          {services.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum serviço cadastrado.</p>
          ) : (
            <ul className="space-y-3">
              {services.map((svc) => (
                <ServiceRow
                  key={svc.id}
                  contractId={cid}
                  service={svc}
                  busy={busy}
                  onError={setError}
                  onBusy={setBusy}
                  onUpdated={setContract}
                />
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {!showsModules(contract.contractType) && !showsServices(contract.contractType) ? (
        <p className="text-sm text-slate-500">
          O tipo deste contrato não inclui edição de módulos/serviços neste ecrã.
        </p>
      ) : null}
    </div>
  );
}

function ModuleBlock(props: {
  contractId: string;
  module: ModuleRow;
  allModules: ModuleRow[];
  busy: boolean;
  onError: (m: string | null) => void;
  onBusy: (b: boolean) => void;
  onUpdated: (c: Contract) => void;
}): JSX.Element {
  const { contractId, module: mod, allModules, busy, onError, onBusy, onUpdated } = props;
  const [name, setName] = useState(mod.name);
  const [weight, setWeight] = useState(String(mod.weight));
  const [fName, setFName] = useState("");

  useEffect(() => {
    setName(mod.name);
    setWeight(String(mod.weight));
  }, [mod.name, mod.weight]);
  const [fWeight, setFWeight] = useState("");
  const [fStatus, setFStatus] = useState<ContractFeatureStatus>("NOT_STARTED");

  async function exec(op: () => Promise<Contract>): Promise<void> {
    onError(null);
    onBusy(true);
    try {
      onUpdated(await op());
    } catch (e) {
      onError(e instanceof Error ? e.message : "Erro");
    } finally {
      onBusy(false);
    }
  }

  const featureSumSaved = projectModuleFeaturesSum(mod.features);
  const featuresSumAlert = mod.features.length > 0 && !weightSumMatchesTarget(featureSumSaved);

  return (
    <div
      className={`rounded-lg border bg-slate-50/50 p-3 ${
        featuresSumAlert ? "border-amber-300 border-l-4 border-l-amber-500" : "border-slate-200"
      }`}
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-[10rem] flex-col text-xs text-slate-600">
          Módulo
          <input
            className="mt-0.5 rounded border border-slate-300 px-2 py-1 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
        </label>
        <label className="flex w-28 flex-col text-xs text-slate-600">
          Peso
          <input
            className="mt-0.5 rounded border border-slate-300 px-2 py-1 text-sm"
            type="number"
            step="0.0001"
            min={0}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            disabled={busy}
          />
        </label>
        <button
          type="button"
          className="rounded border border-slate-400 px-2 py-1 text-xs hover:bg-white disabled:opacity-50"
          disabled={busy}
          onClick={() => {
            const w = parseContractWeight(weight);
            if (!Number.isFinite(w)) {
              onError("Peso inválido.");
              return;
            }
            const projected = projectContractModulesSum(allModules, { id: mod.id, weight: w });
            if (!confirmWeightSumDeviation(projected, "Pesos dos módulos")) {
              return;
            }
            void exec(async () => updateContractModule(contractId, mod.id, { name: name.trim(), weight: w }));
          }}
        >
          Guardar módulo
        </button>
        <button
          type="button"
          className="rounded border border-red-300 px-2 py-1 text-xs text-red-800 hover:bg-red-50 disabled:opacity-50"
          disabled={busy}
          onClick={() => {
            if (!confirm("Remover este módulo e todas as funcionalidades?")) return;
            const projected = projectContractModulesSum(allModules.filter((m) => m.id !== mod.id));
            if (!confirmWeightSumDeviation(projected, "Pesos dos módulos (após remover o módulo)")) {
              return;
            }
            void exec(() => deleteContractModule(contractId, mod.id));
          }}
        >
          Apagar módulo
        </button>
      </div>

      <div className="mt-3 border-t border-slate-200 pt-3">
        <p className="mb-2 text-xs font-medium text-slate-700">Funcionalidades</p>
        {mod.features.length > 0 ? (
          <p className={`mb-2 text-xs ${featuresSumAlert ? "font-medium text-amber-900" : "text-slate-600"}`}>
            Soma dos pesos das funcionalidades (gravada):{" "}
            <span className="tabular-nums">{formatWeightPt(featureSumSaved)}</span>
            {weightSumMatchesTarget(featureSumSaved) ? " — alinhado à meta 1" : " — ajuste para somar 1 ou confirme ao gravar"}
          </p>
        ) : (
          <p className="mb-2 text-xs text-slate-500">
            Sem funcionalidades neste módulo. Ao incluir, a soma dos pesos das funcionalidades deve ser 1.
          </p>
        )}
        <ul className="space-y-2">
          {mod.features.map((f) => (
            <FeatureRow
              key={f.id}
              contractId={contractId}
              moduleId={mod.id}
              moduleName={mod.name}
              moduleFeatures={mod.features}
              feature={f}
              busy={busy}
              onError={onError}
              onBusy={onBusy}
              onUpdated={onUpdated}
            />
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            className="min-w-[10rem] rounded border border-slate-300 px-2 py-1 text-sm"
            placeholder="Nova funcionalidade"
            value={fName}
            onChange={(e) => setFName(e.target.value)}
            disabled={busy}
          />
          <input
            className="w-24 rounded border border-slate-300 px-2 py-1 text-sm"
            placeholder="Peso"
            type="number"
            step="0.0001"
            min={0}
            value={fWeight}
            onChange={(e) => setFWeight(e.target.value)}
            disabled={busy}
          />
          <select
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            value={fStatus}
            onChange={(e) => setFStatus(e.target.value as ContractFeatureStatus)}
            disabled={busy}
          >
            {featureStatuses.map((s) => (
              <option key={s} value={s}>
                {featureStatusLabels[s]}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded bg-slate-700 px-2 py-1 text-xs text-white hover:bg-slate-600 disabled:opacity-50"
            disabled={busy || !fName.trim()}
            onClick={() => {
              const w = parseContractWeight(fWeight);
              if (!Number.isFinite(w)) {
                onError("Peso da funcionalidade inválido.");
                return;
              }
              const projected = projectModuleFeaturesSum(mod.features) + w;
              if (!confirmWeightSumDeviation(projected, `Funcionalidades do módulo «${mod.name}»`)) {
                return;
              }
              void exec(async () => {
                const c = await createContractFeature(contractId, mod.id, {
                  name: fName.trim(),
                  weight: w,
                  status: fStatus
                });
                setFName("");
                setFWeight("");
                setFStatus("NOT_STARTED");
                return c;
              });
            }}
          >
            Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}

function FeatureRow(props: {
  contractId: string;
  moduleId: string;
  moduleName: string;
  moduleFeatures: ModuleRow["features"];
  feature: ModuleRow["features"][number];
  busy: boolean;
  onError: (m: string | null) => void;
  onBusy: (b: boolean) => void;
  onUpdated: (c: Contract) => void;
}): JSX.Element {
  const { contractId, moduleId, moduleName, moduleFeatures, feature: f, busy, onError, onBusy, onUpdated } = props;
  const [name, setName] = useState(f.name);
  const [weight, setWeight] = useState(String(f.weight));
  const [status, setStatus] = useState<ContractFeatureStatus>(f.status as ContractFeatureStatus);

  useEffect(() => {
    setName(f.name);
    setWeight(String(f.weight));
    setStatus(f.status as ContractFeatureStatus);
  }, [f.name, f.weight, f.status]);

  async function exec(op: () => Promise<Contract>): Promise<void> {
    onError(null);
    onBusy(true);
    try {
      onUpdated(await op());
    } catch (e) {
      onError(e instanceof Error ? e.message : "Erro");
    } finally {
      onBusy(false);
    }
  }

  return (
    <li className="flex flex-wrap items-end gap-2 rounded border border-slate-200 bg-white px-2 py-2 text-sm">
      <input className="min-w-[8rem] flex-1 rounded border border-slate-300 px-2 py-1" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
      <input
        className="w-24 rounded border border-slate-300 px-2 py-1"
        type="number"
        step="0.0001"
        min={0}
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        disabled={busy}
      />
      <select className="rounded border border-slate-300 px-2 py-1 text-xs" value={status} onChange={(e) => setStatus(e.target.value as ContractFeatureStatus)} disabled={busy}>
        {featureStatuses.map((s) => (
          <option key={s} value={s}>
            {featureStatusLabels[s]}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="rounded border border-slate-400 px-2 py-0.5 text-xs disabled:opacity-50"
        disabled={busy}
        onClick={() => {
          const w = parseContractWeight(weight);
          if (!Number.isFinite(w)) {
            onError("Peso inválido.");
            return;
          }
          const projected = projectModuleFeaturesSum(moduleFeatures, { id: f.id, weight: w });
          if (!confirmWeightSumDeviation(projected, `Funcionalidades do módulo «${moduleName}»`)) {
            return;
          }
          void exec(async () =>
            updateContractFeature(contractId, moduleId, f.id, {
              name: name.trim(),
              weight: w,
              status
            })
          );
        }}
      >
        Guardar
      </button>
      <button
        type="button"
        className="text-xs text-red-700 hover:underline disabled:opacity-50"
        disabled={busy}
        onClick={() => {
          if (!confirm("Remover esta funcionalidade?")) return;
          const projected = projectModuleFeaturesSum(moduleFeatures.filter((x) => x.id !== f.id));
          if (!confirmWeightSumDeviation(projected, `Funcionalidades do módulo «${moduleName}» (após remover)`)) {
            return;
          }
          void exec(() => deleteContractFeature(contractId, moduleId, f.id));
        }}
      >
        Apagar
      </button>
    </li>
  );
}

function ServiceRow(props: {
  contractId: string;
  service: NonNullable<Contract["services"]>[number];
  busy: boolean;
  onError: (m: string | null) => void;
  onBusy: (b: boolean) => void;
  onUpdated: (c: Contract) => void;
}): JSX.Element {
  const { contractId, service: svc, busy, onError, onBusy, onUpdated } = props;
  const [name, setName] = useState(svc.name);
  const [unit, setUnit] = useState(svc.unit);
  const [unitValue, setUnitValue] = useState(String(svc.unitValue));

  useEffect(() => {
    setName(svc.name);
    setUnit(svc.unit);
    setUnitValue(String(svc.unitValue));
  }, [svc.name, svc.unit, svc.unitValue]);

  async function exec(op: () => Promise<Contract>): Promise<void> {
    onError(null);
    onBusy(true);
    try {
      onUpdated(await op());
    } catch (e) {
      onError(e instanceof Error ? e.message : "Erro");
    } finally {
      onBusy(false);
    }
  }

  return (
    <li className="flex flex-wrap items-end gap-2 rounded border border-slate-200 bg-white px-2 py-2">
      <input className="min-w-[8rem] rounded border border-slate-300 px-2 py-1 text-sm" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
      <input className="w-24 rounded border border-slate-300 px-2 py-1 text-sm" value={unit} onChange={(e) => setUnit(e.target.value)} disabled={busy} />
      <input
        className="w-32 rounded border border-slate-300 px-2 py-1 text-sm"
        type="number"
        step="0.0001"
        min={0}
        value={unitValue}
        onChange={(e) => setUnitValue(e.target.value)}
        disabled={busy}
      />
      <button
        type="button"
        className="rounded border border-slate-400 px-2 py-1 text-xs disabled:opacity-50"
        disabled={busy}
        onClick={() =>
          void exec(async () => {
            const v = Number(unitValue.replace(",", "."));
            if (!Number.isFinite(v) || v < 0) {
              throw new Error("Valor inválido.");
            }
            return updateContractService(contractId, svc.id, { name: name.trim(), unit: unit.trim(), unitValue: v });
          })
        }
      >
        Guardar
      </button>
      <button
        type="button"
        className="text-xs text-red-700 hover:underline disabled:opacity-50"
        disabled={busy}
        onClick={() => {
          if (!confirm("Remover este serviço?")) return;
          void exec(() => deleteContractService(contractId, svc.id));
        }}
      >
        Apagar
      </button>
    </li>
  );
}
