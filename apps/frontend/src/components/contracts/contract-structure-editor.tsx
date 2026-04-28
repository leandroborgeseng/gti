"use client";

import { Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Modal } from "@/components/ui/modal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Contract, ContractItemCriticality, ContractItemDeliveryStatus } from "@/lib/api";
import {
  createContractFeature,
  createContractModule,
  createContractService,
  deleteContractFeature,
  deleteContractModule,
  deleteContractService,
  fetchContractStructureTemplateBlob,
  getContractModuleValidators,
  importContractStructureFromXlsx,
  updateContractFeature,
  updateContractModule,
  updateContractService,
  type ContractFeatureStatus
} from "@/lib/api";
import {
  formatWeightPt,
  projectContractModulesSum,
  projectModuleFeaturesSum,
  weightSumMatchesTarget
} from "@/lib/contract-weights";
import { queryKeys } from "@/lib/query-keys";
import { buttonSmallClass, buttonSmallPrimaryClass, formControlClass } from "@/components/ui/form-primitives";
import { cn } from "@/lib/utils";

const featureStatusLabels: Record<ContractFeatureStatus, string> = {
  NOT_STARTED: "Não iniciada",
  IN_PROGRESS: "Em progresso",
  DELIVERED: "Entregue",
  VALIDATED: "Validada"
};

const featureStatuses: ContractFeatureStatus[] = ["NOT_STARTED", "IN_PROGRESS", "DELIVERED", "VALIDATED"];

const itemDeliveryLabels: Record<ContractItemDeliveryStatus, string> = {
  NOT_DELIVERED: "Entrega: não entregue",
  PARTIALLY_DELIVERED: "Entrega: parcial",
  DELIVERED: "Entrega: concluída"
};

const itemDeliveryOptions: ContractItemDeliveryStatus[] = ["NOT_DELIVERED", "PARTIALLY_DELIVERED", "DELIVERED"];

const criticalityLabels: Record<ContractItemCriticality, string> = {
  CRITICA: "Crítica (5)",
  ALTA: "Alta (4)",
  MEDIA: "Média (3)",
  BAIXA: "Baixa (2)",
  APOIO: "Apoio (1)"
};

const criticalityOptions: ContractItemCriticality[] = ["CRITICA", "ALTA", "MEDIA", "BAIXA", "APOIO"];

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
          — fora da meta (esperado ≈ 1). Ajuste os pesos ou confirme ao salvar; o sistema pedirá confirmação se a soma continuar desalinhada.
        </span>
      )}
    </div>
  );
}

export function ContractStructureEditor(props: { contract: Contract }): JSX.Element {
  const [contract, setContract] = useState(props.contract);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: validators = [] } = useQuery({
    queryKey: queryKeys.contractModuleValidators,
    queryFn: getContractModuleValidators
  });

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

  const [structureModalOpen, setStructureModalOpen] = useState(false);
  const [structureModalKind, setStructureModalKind] = useState<"module" | "feature">("module");
  const [modalModName, setModalModName] = useState("");
  const [modalModCriticality, setModalModCriticality] = useState<ContractItemCriticality>("MEDIA");
  const [modalModValidatorId, setModalModValidatorId] = useState("");
  const [modalFeatModuleId, setModalFeatModuleId] = useState("");
  const [modalFeatCode, setModalFeatCode] = useState("");
  const [modalFeatName, setModalFeatName] = useState("");
  const [modalFeatCriticality, setModalFeatCriticality] = useState<ContractItemCriticality>("MEDIA");
  const [modalFeatStatus, setModalFeatStatus] = useState<ContractFeatureStatus>("NOT_STARTED");
  const [modalFeatDelivery, setModalFeatDelivery] = useState<ContractItemDeliveryStatus>("NOT_DELIVERED");

  const [replaceOnImport, setReplaceOnImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const fileImportRef = useRef<HTMLInputElement>(null);

  const [newSvcName, setNewSvcName] = useState("");
  const [newSvcUnit, setNewSvcUnit] = useState("");
  const [newSvcValue, setNewSvcValue] = useState("");

  const modules = contract.modules ?? [];
  const services = contract.services ?? [];

  function openStructureModal(): void {
    setModalModName("");
    setModalModCriticality("MEDIA");
    setModalModValidatorId("");
    setModalFeatName("");
    setModalFeatCode("");
    setModalFeatCriticality("MEDIA");
    setModalFeatStatus("NOT_STARTED");
    setModalFeatDelivery("NOT_DELIVERED");
    setModalFeatModuleId(modules[0]?.id ?? "");
    setStructureModalKind(modules.length > 0 ? "feature" : "module");
    setStructureModalOpen(true);
  }

  function closeStructureModal(): void {
    setStructureModalOpen(false);
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}
      {busy ? <p className="text-xs text-slate-500">Salvando…</p> : null}

      {showsModules(contract.contractType) ? (
        <Card className="p-5">
          <h4 className="mb-2 font-medium text-slate-900">Módulos e funcionalidades</h4>
          <p className="mb-4 text-xs text-slate-500">
            Pesos são decimais (use ponto ou vírgula). A soma dos pesos dos módulos e, em cada módulo, a soma das funcionalidades deve ser{" "}
            <strong>1</strong> (tolerância numérica para arredondamentos).
          </p>
          <ModuleWeightsSummary modules={modules} />

          <Tabs defaultValue="funcionalidades" className="w-full">
            <TabsList className="mb-1 h-auto flex-wrap justify-start gap-1">
              <TabsTrigger value="importacao">Importação (planilha)</TabsTrigger>
              <TabsTrigger value="funcionalidades">Funcionalidades</TabsTrigger>
            </TabsList>

            <TabsContent value="importacao" className="mt-3 rounded-md border border-sky-200/80 bg-sky-50/50 px-3 py-3 text-sm text-slate-800">
              <p className="font-medium text-slate-900">Planilha (.xlsx)</p>
              <p className="mt-1 text-xs text-slate-600">
                Baixe o modelo, preencha a aba «Dados» e importe para criar módulos e funcionalidades de uma vez. Leia as instruções na
                aba «Instrucoes».
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={buttonSmallPrimaryClass}
                  disabled={busy}
                  onClick={() => {
                    void (async () => {
                      setError(null);
                      setBusy(true);
                      try {
                        const blob = await fetchContractStructureTemplateBlob(cid);
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `modelo-modulos-funcionalidades-${contract.number.replace(/[^\w.-]+/g, "_")}.xlsx`;
                        a.rel = "noopener";
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        URL.revokeObjectURL(url);
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Erro ao baixar o modelo");
                      } finally {
                        setBusy(false);
                      }
                    })();
                  }}
                >
                  Baixar modelo
                </button>
                <input
                  ref={fileImportRef}
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setImportFile(f);
                  }}
                />
                <button type="button" className={buttonSmallClass} disabled={busy} onClick={() => fileImportRef.current?.click()}>
                  Escolher arquivo…
                </button>
                <button
                  type="button"
                  className={buttonSmallPrimaryClass}
                  disabled={busy || !importFile}
                  onClick={() => {
                    if (!importFile) return;
                    void run(async () => {
                      const next = await importContractStructureFromXlsx(cid, importFile, replaceOnImport);
                      setImportFile(null);
                      setReplaceOnImport(false);
                      if (fileImportRef.current) fileImportRef.current.value = "";
                      return next;
                    });
                  }}
                >
                  Importar
                </button>
              </div>
              {importFile ? (
                <p className="mt-2 text-xs text-slate-600">
                  Selecionado: <span className="font-mono">{importFile.name}</span>
                </p>
              ) : null}
              <div className="mt-3 flex items-start gap-2">
                <Checkbox
                  id="replace-structure-import"
                  checked={replaceOnImport}
                  onCheckedChange={(v) => setReplaceOnImport(v === true)}
                  disabled={busy}
                  className="mt-0.5"
                />
                <label htmlFor="replace-structure-import" className="cursor-pointer text-xs leading-snug text-slate-700">
                  Substituir módulos e funcionalidades existentes (remove os atuais deste contrato antes de importar).
                </label>
              </div>
            </TabsContent>

            <TabsContent value="funcionalidades" className="mt-3">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
                <p className="max-w-xl text-xs text-slate-600">
                  Edite módulos e funcionalidades abaixo ou use o botão para abrir o cadastro rápido em um modal.
                </p>
                <Button type="button" size="sm" disabled={busy} onClick={openStructureModal} className="shrink-0 gap-1.5">
                  <Plus className="h-4 w-4" aria-hidden />
                  Novo módulo ou funcionalidade
                </Button>
              </div>
              <div className="space-y-6">
                {modules.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Nenhum módulo ainda. Use «Novo módulo ou funcionalidade» para criar o primeiro módulo ou importe uma planilha na aba
                    Importação.
                  </p>
                ) : null}
                {modules.map((mod) => (
                  <ModuleBlock
                    key={mod.id}
                    contractId={cid}
                    module={mod}
                    busy={busy}
                    onError={setError}
                    onBusy={setBusy}
                    onUpdated={setContract}
                    validators={validators}
                  />
                ))}
              </div>
            </TabsContent>
          </Tabs>

          <Modal
            open={structureModalOpen}
            onClose={closeStructureModal}
            title="Cadastrar módulo ou funcionalidade"
            description="Escolha o tipo de registro. Os pesos seguem as mesmas regras do restante da tela (soma ≈ 1 por nível)."
            contentClassName="max-w-lg"
          >
            <div className="mb-5 flex gap-2">
              <button
                type="button"
                className={cn(
                  "flex-1 rounded-md border px-3 py-2 text-sm font-medium transition",
                  structureModalKind === "module"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                )}
                disabled={busy}
                onClick={() => setStructureModalKind("module")}
              >
                Novo módulo
              </button>
              <button
                type="button"
                className={cn(
                  "flex-1 rounded-md border px-3 py-2 text-sm font-medium transition",
                  structureModalKind === "feature"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                )}
                disabled={busy || modules.length === 0}
                onClick={() => setStructureModalKind("feature")}
              >
                Nova funcionalidade
              </button>
            </div>

            {structureModalKind === "module" ? (
              <div className="space-y-4">
                <label className="block text-xs font-medium text-slate-700">
                  Nome do módulo
                  <input
                    className={`mt-1 w-full ${formControlClass}`}
                    placeholder="Ex.: Módulo financeiro"
                    value={modalModName}
                    onChange={(e) => setModalModName(e.target.value)}
                    disabled={busy}
                  />
                </label>
                <label className="block text-xs font-medium text-slate-700">
                  Criticidade do módulo
                  <select
                    className={`mt-1 w-full ${formControlClass}`}
                    value={modalModCriticality}
                    onChange={(e) => setModalModCriticality(e.target.value as ContractItemCriticality)}
                    disabled={busy}
                  >
                    {criticalityOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {criticalityLabels[opt]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-slate-700">
                  Fiscal responsável pelo módulo
                  <select
                    className={`mt-1 w-full ${formControlClass}`}
                    value={modalModValidatorId}
                    onChange={(e) => setModalModValidatorId(e.target.value)}
                    disabled={busy}
                  >
                    <option value="">Sem responsável definido</option>
                    {validators.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.email}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" size="sm" disabled={busy} onClick={closeStructureModal}>
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy || !modalModName.trim()}
                    onClick={() => {
                      void run(async () => {
                        const c = await createContractModule(cid, {
                          name: modalModName.trim(),
                          criticality: modalModCriticality,
                          validatorId: modalModValidatorId || null
                        });
                        closeStructureModal();
                        return c;
                      });
                    }}
                  >
                    Salvar módulo
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <label className="block text-xs font-medium text-slate-700">
                  Módulo
                  <select
                    className={`mt-1 w-full ${formControlClass}`}
                    value={modalFeatModuleId}
                    onChange={(e) => setModalFeatModuleId(e.target.value)}
                    disabled={busy || modules.length === 0}
                  >
                    {modules.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-slate-700">
                  Código do Item
                  <input
                    className={`mt-1 w-full ${formControlClass}`}
                    placeholder="Ex.: 1.2.3"
                    value={modalFeatCode}
                    onChange={(e) => setModalFeatCode(e.target.value)}
                    disabled={busy}
                  />
                </label>
                <label className="block text-xs font-medium text-slate-700">
                  Nome da funcionalidade
                  <input
                    className={`mt-1 w-full ${formControlClass}`}
                    placeholder="Descrição curta"
                    value={modalFeatName}
                    onChange={(e) => setModalFeatName(e.target.value)}
                    disabled={busy}
                  />
                </label>
                <label className="block text-xs font-medium text-slate-700">
                  Criticidade
                  <select
                    className={`mt-1 w-full ${formControlClass}`}
                    value={modalFeatCriticality}
                    onChange={(e) => setModalFeatCriticality(e.target.value as ContractItemCriticality)}
                    disabled={busy}
                  >
                    {criticalityOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {criticalityLabels[opt]}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-medium text-slate-700">
                    Estado
                    <select
                      className={`mt-1 w-full ${formControlClass}`}
                      value={modalFeatStatus}
                      onChange={(e) => setModalFeatStatus(e.target.value as ContractFeatureStatus)}
                      disabled={busy}
                    >
                      {featureStatuses.map((s) => (
                        <option key={s} value={s}>
                          {featureStatusLabels[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-medium text-slate-700">
                    Entrega
                    <select
                      className={`mt-1 w-full ${formControlClass}`}
                      value={modalFeatDelivery}
                      onChange={(e) => setModalFeatDelivery(e.target.value as ContractItemDeliveryStatus)}
                      disabled={busy}
                    >
                      {itemDeliveryOptions.map((s) => (
                        <option key={s} value={s}>
                          {itemDeliveryLabels[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" size="sm" disabled={busy} onClick={closeStructureModal}>
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy || !modalFeatName.trim() || !modalFeatModuleId}
                    onClick={() => {
                      const mod = modules.find((m) => m.id === modalFeatModuleId);
                      if (!mod) {
                        setError("Selecione um módulo válido.");
                        return;
                      }
                      void run(async () => {
                        const c = await createContractFeature(cid, mod.id, {
                          itemCode: modalFeatCode.trim() || null,
                          name: modalFeatName.trim(),
                          criticality: modalFeatCriticality,
                          status: modalFeatStatus,
                          deliveryStatus: modalFeatDelivery
                        });
                        closeStructureModal();
                        return c;
                      });
                    }}
                  >
                    Salvar funcionalidade
                  </Button>
                </div>
              </div>
            )}
          </Modal>
        </Card>
      ) : null}

      {showsServices(contract.contractType) ? (
        <Card>
          <h4 className="mb-3 font-medium text-slate-900">Serviços (medição por quantidade)</h4>
          <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-200 pb-4">
            <input
              className={`min-w-[10rem] ${formControlClass}`}
              placeholder="Nome do serviço"
              value={newSvcName}
              onChange={(e) => setNewSvcName(e.target.value)}
              disabled={busy}
            />
            <input
              className={`w-24 ${formControlClass}`}
              placeholder="Unidade"
              value={newSvcUnit}
              onChange={(e) => setNewSvcUnit(e.target.value)}
              disabled={busy}
            />
            <input
              className={`w-32 ${formControlClass}`}
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
              className={buttonSmallPrimaryClass}
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
          O tipo deste contrato não inclui edição de módulos/serviços neste tela.
        </p>
      ) : null}
    </div>
  );
}

function ModuleBlock(props: {
  contractId: string;
  module: ModuleRow;
  busy: boolean;
  onError: (m: string | null) => void;
  onBusy: (b: boolean) => void;
  onUpdated: (c: Contract) => void;
  validators: Array<{ id: string; email: string; role: string }>;
}): JSX.Element {
  const { contractId, module: mod, busy, onError, onBusy, onUpdated, validators } = props;
  const [name, setName] = useState(mod.name);
  const [criticality, setCriticality] = useState<ContractItemCriticality>(mod.criticality ?? "MEDIA");
  const [validatorId, setValidatorId] = useState(mod.validatorId ?? "");
  const [fCode, setFCode] = useState("");
  const [fName, setFName] = useState("");
  const [featuresOpen, setFeaturesOpen] = useState(false);

  useEffect(() => {
    setName(mod.name);
    setCriticality(mod.criticality ?? "MEDIA");
    setValidatorId(mod.validatorId ?? "");
  }, [mod.name, mod.criticality, mod.validatorId]);
  const [fCriticality, setFCriticality] = useState<ContractItemCriticality>("MEDIA");
  const [fStatus, setFStatus] = useState<ContractFeatureStatus>("NOT_STARTED");
  const [fDelivery, setFDelivery] = useState<ContractItemDeliveryStatus>("NOT_DELIVERED");

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
  const deliveredCount = mod.features.filter((f) => f.deliveryStatus === "DELIVERED").length;
  const partialCount = mod.features.filter((f) => f.deliveryStatus === "PARTIALLY_DELIVERED").length;
  const notDeliveredCount = mod.features.filter((f) => (f.deliveryStatus ?? "NOT_DELIVERED") === "NOT_DELIVERED").length;
  const validatorLabel = mod.validator?.email ?? validators.find((user) => user.id === validatorId)?.email ?? "Sem responsável";

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-slate-900">{mod.features.length} itens</span>
          <span className="text-emerald-700">{deliveredCount} entregues</span>
          <span className="text-amber-700">{partialCount} parciais</span>
          <span className="text-red-700">{notDeliveredCount} não entregues</span>
        </div>
        <div className="min-w-0">
          <span className="font-medium text-slate-900">Fiscal responsável: </span>
          <span className="break-all text-slate-600">{validatorLabel}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-[10rem] flex-col text-xs text-slate-600">
          Módulo
          <input
            className={`mt-0.5 ${formControlClass}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
        </label>
        <label className="flex min-w-[10rem] flex-col text-xs text-slate-600">
          Criticidade
          <select
            className={`mt-0.5 ${formControlClass}`}
            value={criticality}
            onChange={(e) => setCriticality(e.target.value as ContractItemCriticality)}
            disabled={busy}
          >
            {criticalityOptions.map((opt) => (
              <option key={opt} value={opt}>
                {criticalityLabels[opt]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[14rem] flex-col text-xs text-slate-600">
          Fiscal responsável
          <select
            className={`mt-0.5 ${formControlClass}`}
            value={validatorId}
            onChange={(e) => setValidatorId(e.target.value)}
            disabled={busy}
          >
            <option value="">Sem responsável</option>
            {validators.map((user) => (
              <option key={user.id} value={user.id}>
                {user.email}
              </option>
            ))}
          </select>
        </label>
        <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">
          Peso automático: {formatWeightPt(Number(mod.weight))}
        </span>
        <button
          type="button"
          className={`${buttonSmallClass} text-xs`}
          disabled={busy}
          onClick={() => {
            void exec(async () =>
              updateContractModule(contractId, mod.id, {
                name: name.trim(),
                criticality,
                validatorId: validatorId || null
              })
            );
          }}
        >
          Salvar módulo
        </button>
        <button
          type="button"
          className="rounded border border-red-300 px-2 py-1 text-xs text-red-800 hover:bg-red-50 disabled:opacity-50"
          disabled={busy}
          onClick={() => {
            if (!confirm("Remover este módulo e todas as funcionalidades?")) return;
            void exec(() => deleteContractModule(contractId, mod.id));
          }}
        >
          Apagar módulo
        </button>
      </div>

      <div className="mt-3 border-t border-slate-200 pt-3">
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-md bg-slate-100 px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-200"
          aria-expanded={featuresOpen}
          onClick={() => setFeaturesOpen((open) => !open)}
        >
          <span>
            Funcionalidades ({mod.features.length}) · soma dos pesos{" "}
            <span className="tabular-nums">{formatWeightPt(featureSumSaved)}</span>
          </span>
          <span>{featuresOpen ? "Ocultar" : "Mostrar"}</span>
        </button>

        <div className={featuresOpen ? "mt-3 block" : "hidden"}>
          {mod.features.length === 0 ? (
            <p className="mb-2 text-xs text-slate-500">
              Sem funcionalidades neste módulo. Ao incluir, os pesos serão calculados automaticamente pela criticidade.
            </p>
          ) : null}
          <ul className="space-y-2">
            {mod.features.map((f) => (
              <FeatureRow
                key={f.id}
                contractId={contractId}
                moduleId={mod.id}
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
              className={`w-32 ${formControlClass}`}
              placeholder="Código do item"
              value={fCode}
              onChange={(e) => setFCode(e.target.value)}
              disabled={busy}
            />
            <input
              className={`min-w-[10rem] ${formControlClass}`}
              placeholder="Nova funcionalidade"
              value={fName}
              onChange={(e) => setFName(e.target.value)}
              disabled={busy}
            />
            <select
              className={`${formControlClass} text-sm`}
              value={fCriticality}
              onChange={(e) => setFCriticality(e.target.value as ContractItemCriticality)}
              disabled={busy}
            >
              {criticalityOptions.map((s) => (
                <option key={s} value={s}>
                  {criticalityLabels[s]}
                </option>
              ))}
            </select>
            <select
              className={`${formControlClass} text-sm`}
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
            <select
              className={`${formControlClass} text-sm`}
              value={fDelivery}
              onChange={(e) => setFDelivery(e.target.value as ContractItemDeliveryStatus)}
              disabled={busy}
            >
              {itemDeliveryOptions.map((s) => (
                <option key={s} value={s}>
                  {itemDeliveryLabels[s]}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="rounded bg-slate-700 px-2 py-1 text-xs text-white hover:bg-slate-600 disabled:opacity-50"
              disabled={busy || !fName.trim()}
              onClick={() => {
                void exec(async () => {
                  const c = await createContractFeature(contractId, mod.id, {
                    itemCode: fCode.trim() || null,
                    name: fName.trim(),
                    criticality: fCriticality,
                    status: fStatus,
                    deliveryStatus: fDelivery
                  });
                  setFCode("");
                  setFName("");
                  setFCriticality("MEDIA");
                  setFStatus("NOT_STARTED");
                  setFDelivery("NOT_DELIVERED");
                  return c;
                });
              }}
            >
              Adicionar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureRow(props: {
  contractId: string;
  moduleId: string;
  feature: ModuleRow["features"][number];
  busy: boolean;
  onError: (m: string | null) => void;
  onBusy: (b: boolean) => void;
  onUpdated: (c: Contract) => void;
}): JSX.Element {
  const { contractId, moduleId, feature: f, busy, onError, onBusy, onUpdated } = props;
  const [itemCode, setItemCode] = useState(f.itemCode ?? "");
  const [name, setName] = useState(f.name);
  const [criticality, setCriticality] = useState<ContractItemCriticality>(f.criticality ?? "MEDIA");
  const [status, setStatus] = useState<ContractFeatureStatus>(f.status as ContractFeatureStatus);
  const [deliveryStatus, setDeliveryStatus] = useState<ContractItemDeliveryStatus>(
    (f.deliveryStatus as ContractItemDeliveryStatus | undefined) ?? "NOT_DELIVERED"
  );

  useEffect(() => {
    setItemCode(f.itemCode ?? "");
    setName(f.name);
    setCriticality(f.criticality ?? "MEDIA");
    setStatus(f.status as ContractFeatureStatus);
    setDeliveryStatus((f.deliveryStatus as ContractItemDeliveryStatus | undefined) ?? "NOT_DELIVERED");
  }, [f.itemCode, f.name, f.criticality, f.status, f.deliveryStatus]);

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
      <input
        className={`w-32 ${formControlClass}`}
        placeholder="Código"
        value={itemCode}
        onChange={(e) => setItemCode(e.target.value)}
        disabled={busy}
      />
      <input className={`min-w-[8rem] flex-1 ${formControlClass}`} value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
      <select
        className={`${formControlClass} py-1.5 text-xs`}
        value={criticality}
        onChange={(e) => setCriticality(e.target.value as ContractItemCriticality)}
        disabled={busy}
      >
        {criticalityOptions.map((s) => (
          <option key={s} value={s}>
            {criticalityLabels[s]}
          </option>
        ))}
      </select>
      <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">Peso {formatWeightPt(Number(f.weight))}</span>
      <select className={`${formControlClass} py-1.5 text-xs`} value={status} onChange={(e) => setStatus(e.target.value as ContractFeatureStatus)} disabled={busy}>
        {featureStatuses.map((s) => (
          <option key={s} value={s}>
            {featureStatusLabels[s]}
          </option>
        ))}
      </select>
      <select
        className={`${formControlClass} min-w-[10.5rem] py-1.5 text-xs`}
        value={deliveryStatus}
        onChange={(e) => setDeliveryStatus(e.target.value as ContractItemDeliveryStatus)}
        disabled={busy}
      >
        {itemDeliveryOptions.map((s) => (
          <option key={s} value={s}>
            {itemDeliveryLabels[s]}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={`${buttonSmallClass} py-0.5 text-xs`}
        disabled={busy}
        onClick={() => {
          void exec(async () =>
            updateContractFeature(contractId, moduleId, f.id, {
              itemCode: itemCode.trim() || null,
              name: name.trim(),
              criticality,
              status,
              deliveryStatus
            })
          );
        }}
      >
        Salvar
      </button>
      <button
        type="button"
        className="text-xs text-red-700 hover:underline disabled:opacity-50"
        disabled={busy}
        onClick={() => {
          if (!confirm("Remover esta funcionalidade?")) return;
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
      <input className={`min-w-[8rem] ${formControlClass}`} value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
      <input className={`w-24 ${formControlClass}`} value={unit} onChange={(e) => setUnit(e.target.value)} disabled={busy} />
      <input
        className={`w-32 ${formControlClass}`}
        type="number"
        step="0.0001"
        min={0}
        value={unitValue}
        onChange={(e) => setUnitValue(e.target.value)}
        disabled={busy}
      />
      <button
        type="button"
        className={`${buttonSmallClass} text-xs`}
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
        Salvar
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
