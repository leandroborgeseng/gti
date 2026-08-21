"use client";

import { Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { InlineLoading } from "@/components/ui/inline-loading";
import { Modal } from "@/components/ui/modal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Contract, ContractItemCriticality, ContractItemDeliveryStatus, ModulesDeliveryFeature } from "@/lib/api";
import {
  createContractFeature,
  createContractModule,
  createContractService,
  deleteContractFeature,
  deleteContractModule,
  deleteContractService,
  fetchContractStructureTemplateBlob,
  getContractStructure,
  getModuleFeaturesDelivery,
  importContractStructureFromXlsx,
  updateContractFeature,
  updateContractModule,
  updateContractService,
  type ContractFeatureStatus,
  type ContractLinkedUser
} from "@/lib/api";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import {
  formatWeightPt,
  projectContractModulesSum,
  projectModuleFeaturesSum,
  weightSumMatchesTarget
} from "@/lib/contract-weights";
import { queryKeys } from "@/lib/query-keys";
import { buttonSmallClass, buttonSmallPrimaryClass, formControlClass } from "@/components/ui/form-primitives";
import { UserMultiSelect } from "@/components/ui/user-multi-select";
import { cn } from "@/lib/utils";
import { orderFeaturesByItemCode } from "@/lib/item-code-order";

function moduleFiscalUsers(mod: ModuleRow): ContractLinkedUser[] {
  if (mod.fiscalUsers && mod.fiscalUsers.length > 0) return mod.fiscalUsers;
  if (mod.validator) {
    return [
      {
        id: mod.validator.id,
        name: mod.validator.name || mod.validator.email,
        email: mod.validator.email,
        active: true,
        role: mod.validator.role
      }
    ];
  }
  return [];
}

function moduleFiscalUserIds(mod: ModuleRow): string[] {
  if (mod.fiscalUserIds && mod.fiscalUserIds.length > 0) return mod.fiscalUserIds;
  return moduleFiscalUsers(mod).map((u) => u.id);
}

function formatUsersSummary(users: ContractLinkedUser[], emptyLabel = "Sem responsável"): string {
  if (users.length === 0) return emptyLabel;
  const names = users.map((u) => u.name || u.email);
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

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
  APOIO: "Apoio (1)",
  NAO_SE_APLICA: "Não se aplica"
};

const criticalityOptions: ContractItemCriticality[] = [
  "CRITICA",
  "ALTA",
  "MEDIA",
  "BAIXA",
  "APOIO",
  "NAO_SE_APLICA"
];
const REQUIRED_ITEM_CODE_MESSAGE = "O campo obrigatório Código do Item deve ser preenchido antes de gravar a informação.";

function showsModules(contractType: string): boolean {
  return ["SOFTWARE", "INFRA", "SERVICO"].includes(contractType);
}

function showsServices(contractType: string): boolean {
  return ["DATACENTER", "INFRA", "SERVICO"].includes(contractType);
}

type ModuleRow = NonNullable<Contract["modules"]>[number];
type FeatureRowData = NonNullable<ModuleRow["features"]>[number] | ModulesDeliveryFeature;
const STRUCTURE_FEATURES_PAGE_SIZE = 40;
type FeatureFilters = {
  deliveryStatus: "" | ContractItemDeliveryStatus;
  criticality: "" | ContractItemCriticality;
  query: string;
};

function normalizeFilterText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function featureMatchesFilters(feature: FeatureRowData, filters: FeatureFilters): boolean {
  const deliveryStatus = (feature.deliveryStatus ?? "NOT_DELIVERED") as ContractItemDeliveryStatus;
  const criticality = (feature.criticality ?? "MEDIA") as ContractItemCriticality;
  const query = normalizeFilterText(filters.query);

  if (filters.deliveryStatus && deliveryStatus !== filters.deliveryStatus) return false;
  if (filters.criticality && criticality !== filters.criticality) return false;
  if (!query) return true;

  return normalizeFilterText(`${feature.itemCode ?? ""} ${feature.name}`).includes(query);
}

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
        <span className="ml-2 text-emerald-900">- alinhado à meta 1</span>
      ) : (
        <span className="ml-2">
          - fora da meta (esperado ≈ 1). Ajuste os pesos ou confirme ao salvar; o sistema pedirá confirmação se a soma continuar desalinhada.
        </span>
      )}
    </div>
  );
}

export function ContractStructureEditor(props: { contract: Contract }): JSX.Element {
  const qc = useQueryClient();
  const structureQuery = useQuery({
    queryKey: queryKeys.contractStructure(props.contract.id),
    queryFn: () => getContractStructure(props.contract.id)
  });
  const [contract, setContract] = useState(props.contract);
  useEffect(() => {
    if (structureQuery.data) setContract(structureQuery.data);
  }, [structureQuery.data]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: permissions } = useMyPermissions();
  const cid = contract.id;

  async function run(op: () => Promise<Contract>): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const next = await op();
      setContract(next);
      qc.setQueryData(queryKeys.contractStructure(cid), next);
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
  const [modalModFiscalUserIds, setModalModFiscalUserIds] = useState<string[]>([]);
  const [modalFeatModuleId, setModalFeatModuleId] = useState("");
  const [modalFeatCode, setModalFeatCode] = useState("");
  const [modalFeatCodeError, setModalFeatCodeError] = useState(false);
  const [modalFeatName, setModalFeatName] = useState("");
  const [modalFeatCriticality, setModalFeatCriticality] = useState<ContractItemCriticality>("MEDIA");
  const [modalFeatStatus, setModalFeatStatus] = useState<ContractFeatureStatus>("NOT_STARTED");
  const [modalFeatDelivery, setModalFeatDelivery] = useState<ContractItemDeliveryStatus>("NOT_DELIVERED");
  const [modalFeatValidationGroupId, setModalFeatValidationGroupId] = useState("");

  const [replaceOnImport, setReplaceOnImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const fileImportRef = useRef<HTMLInputElement>(null);
  const [featureFilters, setFeatureFilters] = useState<FeatureFilters>({
    deliveryStatus: "",
    criticality: "",
    query: ""
  });

  const [newSvcName, setNewSvcName] = useState("");
  const [newSvcUnit, setNewSvcUnit] = useState("");
  const [newSvcValue, setNewSvcValue] = useState("");

  const permissionKeys = permissions?.keys ?? [];
  const canEditStructure = permissionKeys.includes("contracts.edit");
  const canEditDelivery = permissionKeys.includes("contracts.features.edit_delivery");
  const canEditCriticality = permissionKeys.includes("contracts.features.edit_criticality");

  if (!canEditStructure) {
    return <></>;
  }

  if (structureQuery.isPending) {
    return (
      <Card className="p-5">
        <InlineLoading label="Carregando módulos e funcionalidades…" />
      </Card>
    );
  }

  if (structureQuery.isError) {
    return (
      <Card className="p-5">
        <p className="text-sm text-red-800" role="alert">
          Não foi possível carregar a estrutura do contrato.
        </p>
      </Card>
    );
  }

  const modules = contract.modules ?? [];
  const services = contract.services ?? [];
  const glosaPricingItems = (contract.pricingItems ?? []).filter(
    (item) =>
      item.status === "ACTIVE" &&
      (item.includeInGlosaBase || item.type?.participatesInGlosa || item.type?.code === "MENSALIDADE")
  );
  const hasFeatureFilters = Boolean(featureFilters.deliveryStatus || featureFilters.criticality || featureFilters.query.trim());
  const totalFeaturesCount = modules.reduce(
    (total, mod) => total + (mod.featuresCount ?? mod.features?.length ?? 0),
    0
  );

  function openStructureModal(): void {
    setModalModName("");
    setModalModCriticality("MEDIA");
    setModalModFiscalUserIds([]);
    setModalFeatName("");
    setModalFeatCode("");
    setModalFeatCodeError(false);
    setModalFeatCriticality("MEDIA");
    setModalFeatStatus("NOT_STARTED");
    setModalFeatDelivery("NOT_DELIVERED");
    setModalFeatValidationGroupId((contract.validationGroups ?? []).find((g) => g.active)?.id ?? "");
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
                      if (next.importSummary?.message) {
                        if (next.importSummary.undefinedGroupCount > 0) {
                          toast.message(next.importSummary.message);
                        } else {
                          toast.success(next.importSummary.message);
                        }
                      }
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
              <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-3">
                <div className="grid gap-3 md:grid-cols-[1.3fr_1fr_1fr_auto] md:items-end">
                  <label className="flex flex-col text-xs font-medium text-slate-700">
                    Pesquisar por código ou descrição
                    <input
                      className={`mt-1 ${formControlClass}`}
                      value={featureFilters.query}
                      onChange={(event) => setFeatureFilters((filters) => ({ ...filters, query: event.target.value }))}
                      placeholder="Ex.: 33.1, legado, processo físico..."
                      disabled={busy}
                    />
                  </label>
                  <label className="flex flex-col text-xs font-medium text-slate-700">
                    Status de entrega
                    <select
                      className={`mt-1 ${formControlClass}`}
                      value={featureFilters.deliveryStatus}
                      onChange={(event) =>
                        setFeatureFilters((filters) => ({
                          ...filters,
                          deliveryStatus: event.target.value as FeatureFilters["deliveryStatus"]
                        }))
                      }
                      disabled={busy}
                    >
                      <option value="">Todos os status</option>
                      {itemDeliveryOptions.map((status) => (
                        <option key={status} value={status}>
                          {itemDeliveryLabels[status]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col text-xs font-medium text-slate-700">
                    Criticidade
                    <select
                      className={`mt-1 ${formControlClass}`}
                      value={featureFilters.criticality}
                      onChange={(event) =>
                        setFeatureFilters((filters) => ({
                          ...filters,
                          criticality: event.target.value as FeatureFilters["criticality"]
                        }))
                      }
                      disabled={busy}
                    >
                      <option value="">Todas as criticidades</option>
                      {criticalityOptions.map((criticality) => (
                        <option key={criticality} value={criticality}>
                          {criticalityLabels[criticality]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className={`${buttonSmallClass} h-10 justify-center`}
                    disabled={busy || !hasFeatureFilters}
                    onClick={() => setFeatureFilters({ deliveryStatus: "", criticality: "", query: "" })}
                  >
                    Limpar filtros
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {hasFeatureFilters
                    ? `Filtros ativos — ao expandir cada módulo, a lista carrega só os itens correspondentes (de ${totalFeaturesCount} no contrato).`
                    : "Use os filtros para priorizar itens por entrega, criticidade ou localizar pelo código e descrição. As funcionalidades carregam ao expandir o módulo."}
                </p>
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
                    validationGroups={contract.validationGroups ?? []}
                    featureFilters={featureFilters}
                    autoOpen={hasFeatureFilters}
                    busy={busy}
                    onError={setError}
                    onBusy={setBusy}
                    onUpdated={setContract}
                    glosaPricingItems={glosaPricingItems}
                    canEditDelivery={canEditDelivery}
                    canEditCriticality={canEditCriticality}
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
                <UserMultiSelect
                  id="modal-mod-fiscals"
                  label="Fiscais / responsáveis pelo acompanhamento do módulo"
                  value={modalModFiscalUserIds}
                  onChange={setModalModFiscalUserIds}
                  disabled={busy}
                  placeholder="Sem acompanhamento definido"
                  hint="Acompanham o módulo; não são automaticamente responsáveis diretos das funcionalidades."
                />
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
                          fiscalUserIds: modalModFiscalUserIds
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
                  Código do Item <span className="text-destructive">*</span>
                  <input
                    className={cn(
                      "mt-1 w-full",
                      formControlClass,
                      modalFeatCodeError && "border-destructive focus-visible:ring-destructive"
                    )}
                    placeholder="Ex.: 1.2.3"
                    value={modalFeatCode}
                    aria-invalid={modalFeatCodeError}
                    onChange={(e) => {
                      setModalFeatCode(e.target.value);
                      if (e.target.value.trim()) setModalFeatCodeError(false);
                    }}
                    disabled={busy}
                  />
                  {modalFeatCodeError ? <span className="mt-1 block text-xs text-destructive">{REQUIRED_ITEM_CODE_MESSAGE}</span> : null}
                </label>
                <label className="block text-xs font-medium text-slate-700">
                  Descrição da funcionalidade
                  <textarea
                    className={`mt-1 min-h-[5.5rem] max-h-[18rem] w-full resize-y ${formControlClass}`}
                    placeholder="Descrição completa da funcionalidade"
                    value={modalFeatName}
                    onChange={(e) => setModalFeatName(e.target.value)}
                    disabled={busy}
                    rows={4}
                  />
                </label>
                {canEditCriticality ? (
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
                ) : null}
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
                  {canEditDelivery ? (
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
                  ) : null}
                </div>
                <label className="block text-xs font-medium text-slate-700">
                  Grupo de validação <span className="text-destructive">*</span>
                  <select
                    className={`mt-1 w-full ${formControlClass}`}
                    value={modalFeatValidationGroupId}
                    onChange={(e) => setModalFeatValidationGroupId(e.target.value)}
                    disabled={busy}
                  >
                    <option value="">Selecione um grupo…</option>
                    {(contract.validationGroups ?? [])
                      .filter((g) => g.active)
                      .map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
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
                    disabled={busy || !modalFeatName.trim() || !modalFeatModuleId || !modalFeatValidationGroupId}
                    onClick={() => {
                      if (!modalFeatCode.trim()) {
                        setModalFeatCodeError(true);
                        toast.error(REQUIRED_ITEM_CODE_MESSAGE);
                        return;
                      }
                      if (!modalFeatValidationGroupId) {
                        setError("Selecione o grupo de validação da funcionalidade.");
                        return;
                      }
                      const mod = modules.find((m) => m.id === modalFeatModuleId);
                      if (!mod) {
                        setError("Selecione um módulo válido.");
                        return;
                      }
                      void run(async () => {
                        const c = await createContractFeature(cid, mod.id, {
                          itemCode: modalFeatCode.trim() || null,
                          name: modalFeatName.trim(),
                          status: modalFeatStatus,
                          validationGroupId: modalFeatValidationGroupId,
                          ...(canEditCriticality ? { criticality: modalFeatCriticality } : {}),
                          ...(canEditDelivery ? { deliveryStatus: modalFeatDelivery } : {})
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
  validationGroups: NonNullable<Contract["validationGroups"]>;
  featureFilters: FeatureFilters;
  autoOpen?: boolean;
  busy: boolean;
  onError: (m: string | null) => void;
  onBusy: (b: boolean) => void;
  onUpdated: (c: Contract) => void;
  glosaPricingItems: Array<{ id: string; sequence: number; description: string }>;
  canEditDelivery: boolean;
  canEditCriticality: boolean;
}): JSX.Element {
  const {
    contractId,
    module: mod,
    validationGroups,
    featureFilters,
    autoOpen = false,
    busy,
    onError,
    onBusy,
    onUpdated,
    glosaPricingItems,
    canEditDelivery,
    canEditCriticality
  } = props;
  const qc = useQueryClient();
  const fiscalUsers = moduleFiscalUsers(mod);
  const [name, setName] = useState(mod.name);
  const [criticality, setCriticality] = useState<ContractItemCriticality>(mod.criticality ?? "MEDIA");
  const [fiscalUserIds, setFiscalUserIds] = useState<string[]>(() => moduleFiscalUserIds(mod));
  const [glosaPricingItemId, setGlosaPricingItemId] = useState(mod.glosaPricingItemId ?? "");
  const [fCode, setFCode] = useState("");
  const [fCodeError, setFCodeError] = useState(false);
  const [fName, setFName] = useState("");
  const [featuresOpen, setFeaturesOpen] = useState(autoOpen);

  useEffect(() => {
    if (autoOpen) setFeaturesOpen(true);
  }, [autoOpen]);

  useEffect(() => {
    setName(mod.name);
    setCriticality(mod.criticality ?? "MEDIA");
    setFiscalUserIds(moduleFiscalUserIds(mod));
    setGlosaPricingItemId(mod.glosaPricingItemId ?? "");
  }, [mod]);
  const [fCriticality, setFCriticality] = useState<ContractItemCriticality>("MEDIA");
  const [fStatus, setFStatus] = useState<ContractFeatureStatus>("NOT_STARTED");
  const [fDelivery, setFDelivery] = useState<ContractItemDeliveryStatus>("NOT_DELIVERED");
  const activeGroups = validationGroups.filter((g) => g.active);
  const [fValidationGroupId, setFValidationGroupId] = useState(activeGroups[0]?.id ?? "");

  async function exec(op: () => Promise<Contract>): Promise<void> {
    onError(null);
    onBusy(true);
    try {
      onUpdated(await op());
      void qc.invalidateQueries({ queryKey: queryKeys.moduleFeaturesDelivery(contractId, mod.id) });
      void qc.invalidateQueries({ queryKey: queryKeys.contractStructure(contractId) });
    } catch (e) {
      onError(e instanceof Error ? e.message : "Erro");
    } finally {
      onBusy(false);
    }
  }

  const filterKey = JSON.stringify(featureFilters);
  const featuresQuery = useQuery({
    queryKey: [...queryKeys.moduleFeaturesDelivery(contractId, mod.id), filterKey],
    queryFn: () =>
      getModuleFeaturesDelivery(contractId, mod.id, {
        page: 1,
        pageSize: STRUCTURE_FEATURES_PAGE_SIZE,
        q: featureFilters.query.trim() || undefined,
        deliveryStatus: featureFilters.deliveryStatus || undefined,
        criticality: featureFilters.criticality || undefined
      }),
    enabled: featuresOpen
  });
  const [extraFeatures, setExtraFeatures] = useState<ModulesDeliveryFeature[]>([]);
  const [nextPage, setNextPage] = useState(2);
  const [extraHasMore, setExtraHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    setExtraFeatures([]);
    setNextPage(2);
    setExtraHasMore(false);
  }, [featuresQuery.dataUpdatedAt, filterKey, contractId, mod.id]);

  const loadedFeatures = useMemo(() => {
    const first = featuresQuery.data?.features ?? [];
    if (extraFeatures.length === 0) return first;
    const seen = new Set(first.map((f) => f.id));
    return [...first, ...extraFeatures.filter((f) => !seen.has(f.id))];
  }, [featuresQuery.data?.features, extraFeatures]);
  const hasMore = extraFeatures.length === 0 ? Boolean(featuresQuery.data?.hasMore) : extraHasMore;

  async function loadMoreFeatures(): Promise<void> {
    setLoadingMore(true);
    try {
      const page = await getModuleFeaturesDelivery(contractId, mod.id, {
        page: nextPage,
        pageSize: STRUCTURE_FEATURES_PAGE_SIZE,
        q: featureFilters.query.trim() || undefined,
        deliveryStatus: featureFilters.deliveryStatus || undefined,
        criticality: featureFilters.criticality || undefined
      });
      setExtraFeatures((prev) => {
        const seen = new Set(prev.map((f) => f.id));
        return [...prev, ...page.features.filter((f) => !seen.has(f.id))];
      });
      setNextPage((p) => p + 1);
      setExtraHasMore(page.hasMore);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Não foi possível carregar mais itens.");
    } finally {
      setLoadingMore(false);
    }
  }

  const featureSumSaved =
    mod.featureWeightSum != null ? Number(mod.featureWeightSum) : projectModuleFeaturesSum(mod.features ?? []);
  const deliveredCount = mod.totals?.deliveredCount ?? (mod.features ?? []).filter((f) => f.deliveryStatus === "DELIVERED").length;
  const partialCount =
    mod.totals?.partialCount ?? (mod.features ?? []).filter((f) => f.deliveryStatus === "PARTIALLY_DELIVERED").length;
  const notDeliveredCount =
    mod.totals?.notDeliveredCount ??
    (mod.features ?? []).filter((f) => (f.deliveryStatus ?? "NOT_DELIVERED") === "NOT_DELIVERED").length;
  const featuresCount = mod.featuresCount ?? mod.totals?.totalFeatures ?? (mod.features ?? []).length;
  const fiscalsLabel = formatUsersSummary(fiscalUsers, "Sem fiscal definido");
  const hasFeatureFilters = Boolean(featureFilters.deliveryStatus || featureFilters.criticality || featureFilters.query.trim());
  const orderedFeatures = orderFeaturesByItemCode(loadedFeatures, { flatDepth: hasFeatureFilters });

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-slate-900">{featuresCount} itens</span>
          <span className="text-emerald-700">{deliveredCount} entregues</span>
          <span className="text-amber-700">{partialCount} parciais</span>
          <span className="text-red-700">{notDeliveredCount} não entregues</span>
        </div>
        <div className="min-w-0">
          <span className="font-medium text-slate-900">Acompanhamento do módulo: </span>
          <span className="break-all text-slate-600">{fiscalsLabel}</span>
        </div>
        {mod.glosaPricingItem ? (
          <div className="min-w-0">
            <span className="font-medium text-slate-900">Base de glosa: </span>
            <span className="break-words text-slate-600">
              #{mod.glosaPricingItem.sequence} · {mod.glosaPricingItem.description}
            </span>
          </div>
        ) : null}
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
        <UserMultiSelect
          id={`module-fiscals-${mod.id}`}
          label="Fiscais / responsáveis pelo acompanhamento do módulo"
          className="min-w-[16rem] flex-1"
          value={fiscalUserIds}
          onChange={setFiscalUserIds}
          linkedUsers={fiscalUsers}
          disabled={busy}
          placeholder="Sem acompanhamento definido"
        />
        <label className="flex min-w-[16rem] flex-col text-xs text-slate-600">
          Base de glosa (item contratual)
          <select
            className={`mt-0.5 ${formControlClass}`}
            value={glosaPricingItemId}
            onChange={(e) => setGlosaPricingItemId(e.target.value)}
            disabled={busy}
          >
            <option value="">Sem vínculo</option>
            {glosaPricingItems.map((item) => (
              <option key={item.id} value={item.id}>
                #{item.sequence} · {item.description}
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
                fiscalUserIds,
                glosaPricingItemId: glosaPricingItemId || null
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
            Funcionalidades ({featuresCount}) · soma dos pesos{" "}
            <span className="tabular-nums">{formatWeightPt(featureSumSaved)}</span>
          </span>
          <span>{featuresOpen ? "Ocultar" : "Mostrar"}</span>
        </button>

        <div className={featuresOpen ? "mt-3 block" : "hidden"}>
          {featuresQuery.isLoading ? (
            <p className="mb-2 text-xs text-slate-500">Carregando funcionalidades…</p>
          ) : null}
          {!featuresQuery.isLoading && loadedFeatures.length === 0 ? (
            <p className="mb-2 text-xs text-slate-500">
              {hasFeatureFilters
                ? "Nenhum item neste módulo para os filtros aplicados."
                : "Sem funcionalidades neste módulo. Ao incluir, os pesos serão calculados automaticamente pela criticidade."}
            </p>
          ) : null}
          <ul className="space-y-2">
            {orderedFeatures.map(({ feature: f, depth }) => (
              <FeatureRow
                key={f.id}
                contractId={contractId}
                moduleId={mod.id}
                feature={f as FeatureRowData}
                validationGroups={validationGroups}
                depth={depth}
                busy={busy}
                onError={onError}
                onBusy={onBusy}
                onUpdated={onUpdated}
                canEditDelivery={canEditDelivery}
                canEditCriticality={canEditCriticality}
              />
            ))}
          </ul>
          {hasMore ? (
            <div className="mt-2">
              <button
                type="button"
                className={buttonSmallClass}
                disabled={loadingMore || busy}
                onClick={() => void loadMoreFeatures()}
              >
                {loadingMore ? "Carregando…" : "Carregar mais"}
              </button>
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              className={cn("w-32", formControlClass, fCodeError && "border-destructive focus-visible:ring-destructive")}
              placeholder="Código do item"
              value={fCode}
              aria-invalid={fCodeError}
              onChange={(e) => {
                setFCode(e.target.value);
                if (e.target.value.trim()) setFCodeError(false);
              }}
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
              value={fValidationGroupId}
              onChange={(e) => setFValidationGroupId(e.target.value)}
              disabled={busy || activeGroups.length === 0}
              title="Grupo de validação"
            >
              <option value="">{activeGroups.length === 0 ? "Cadastre um grupo primeiro" : "Grupo de validação…"}</option>
              {activeGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            {canEditCriticality ? (
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
            ) : null}
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
            {canEditDelivery ? (
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
            ) : null}
            <button
              type="button"
              className="rounded bg-slate-700 px-2 py-1 text-xs text-white hover:bg-slate-600 disabled:opacity-50"
              disabled={busy || !fName.trim() || !fValidationGroupId}
              onClick={() => {
                if (!fCode.trim()) {
                  setFCodeError(true);
                  toast.error(REQUIRED_ITEM_CODE_MESSAGE);
                  return;
                }
                if (!fValidationGroupId) {
                  onError("Selecione o grupo de validação da funcionalidade.");
                  return;
                }
                void exec(async () => {
                  const c = await createContractFeature(contractId, mod.id, {
                    itemCode: fCode.trim() || null,
                    name: fName.trim(),
                    status: fStatus,
                    validationGroupId: fValidationGroupId,
                    ...(canEditCriticality ? { criticality: fCriticality } : {}),
                    ...(canEditDelivery ? { deliveryStatus: fDelivery } : {})
                  });
                  setFCode("");
                  setFCodeError(false);
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
  feature: FeatureRowData;
  validationGroups: NonNullable<Contract["validationGroups"]>;
  depth?: number;
  busy: boolean;
  onError: (m: string | null) => void;
  onBusy: (b: boolean) => void;
  onUpdated: (c: Contract) => void;
  canEditDelivery: boolean;
  canEditCriticality: boolean;
}): JSX.Element {
  const {
    contractId,
    moduleId,
    feature: f,
    validationGroups,
    depth = 0,
    busy,
    onError,
    onBusy,
    onUpdated,
    canEditDelivery,
    canEditCriticality
  } = props;
  const qc = useQueryClient();
  const [itemCode, setItemCode] = useState(f.itemCode ?? "");
  const [itemCodeError, setItemCodeError] = useState(false);
  const [name, setName] = useState(f.name);
  const [criticality, setCriticality] = useState<ContractItemCriticality>(f.criticality ?? "MEDIA");
  const [status, setStatus] = useState<ContractFeatureStatus>(f.status as ContractFeatureStatus);
  const [deliveryStatus, setDeliveryStatus] = useState<ContractItemDeliveryStatus>(
    (f.deliveryStatus as ContractItemDeliveryStatus | undefined) ?? "NOT_DELIVERED"
  );
  const [responsibleUserIds, setResponsibleUserIds] = useState<string[]>(() => f.responsibleUserIds ?? []);
  const [validationGroupId, setValidationGroupId] = useState(f.validationGroupId ?? "");

  useEffect(() => {
    setItemCode(f.itemCode ?? "");
    setItemCodeError(false);
    setName(f.name);
    setCriticality(f.criticality ?? "MEDIA");
    setStatus(f.status as ContractFeatureStatus);
    setDeliveryStatus((f.deliveryStatus as ContractItemDeliveryStatus | undefined) ?? "NOT_DELIVERED");
    setResponsibleUserIds(f.responsibleUserIds ?? []);
    setValidationGroupId(f.validationGroupId ?? "");
  }, [f]);

  async function exec(op: () => Promise<Contract>): Promise<void> {
    onError(null);
    onBusy(true);
    try {
      onUpdated(await op());
      void qc.invalidateQueries({ queryKey: queryKeys.moduleFeaturesDelivery(contractId, moduleId) });
      void qc.invalidateQueries({ queryKey: queryKeys.contractStructure(contractId) });
    } catch (e) {
      onError(e instanceof Error ? e.message : "Erro");
    } finally {
      onBusy(false);
    }
  }

  const groupUndefined = !validationGroupId;
  const effectiveUsers = f.effectiveResponsibles ?? [
    ...(f.groupMemberUsers ?? []),
    ...(f.responsibleUsers ?? []).filter((u) => responsibleUserIds.includes(u.id))
  ];
  const effectiveSummary = formatUsersSummary(effectiveUsers, "Sem responsáveis efetivos");
  const activeGroups = validationGroups.filter((g) => g.active || g.id === validationGroupId);

  return (
    <li
      className="flex flex-col gap-2 rounded border border-slate-200 bg-white px-2 py-2 text-sm"
      style={depth > 0 ? { marginLeft: `${depth * 1.25}rem`, borderLeftWidth: "3px", borderLeftColor: "rgb(203 213 225)" } : undefined}
    >
      <div className="flex flex-wrap items-end gap-2">
        <input
          className={cn("w-32", formControlClass, itemCodeError && "border-destructive focus-visible:ring-destructive")}
          placeholder="Código"
          value={itemCode}
          aria-invalid={itemCodeError}
          onChange={(e) => {
            setItemCode(e.target.value);
            if (e.target.value.trim()) setItemCodeError(false);
          }}
          disabled={busy}
        />
        {canEditCriticality ? (
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
        ) : null}
        <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">Peso {formatWeightPt(Number(f.weight))}</span>
        <select className={`${formControlClass} py-1.5 text-xs`} value={status} onChange={(e) => setStatus(e.target.value as ContractFeatureStatus)} disabled={busy}>
          {featureStatuses.map((s) => (
            <option key={s} value={s}>
              {featureStatusLabels[s]}
            </option>
          ))}
        </select>
        {canEditDelivery ? (
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
        ) : null}
        <button
          type="button"
          className={`${buttonSmallClass} py-0.5 text-xs`}
          disabled={busy}
          onClick={() => {
            if (!itemCode.trim()) {
              setItemCodeError(true);
              toast.error(REQUIRED_ITEM_CODE_MESSAGE);
              return;
            }
            void exec(async () =>
              updateContractFeature(contractId, moduleId, f.id, {
                itemCode: itemCode.trim() || null,
                name: name.trim(),
                status,
                validationGroupId: validationGroupId || null,
                responsibleUserIds,
                ...(canEditCriticality ? { criticality } : {}),
                ...(canEditDelivery ? { deliveryStatus } : {})
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
      </div>
      <textarea
        className={`min-h-[4.5rem] max-h-[16rem] w-full resize-y font-normal ${formControlClass}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={busy}
        rows={3}
        aria-label="Descrição da funcionalidade"
      />
      <div className="rounded-md border border-slate-100 bg-slate-50/80 px-2 py-2 space-y-2">
        <label className="block text-xs font-medium text-slate-700">
          Grupo de validação
          <select
            className={cn("mt-1 w-full", formControlClass, groupUndefined && "border-amber-400")}
            value={validationGroupId}
            onChange={(e) => setValidationGroupId(e.target.value)}
            disabled={busy}
          >
            <option value="">Grupo não definido</option>
            {activeGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}{g.active ? "" : " (inativo)"}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {groupUndefined ? (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900">Grupo não definido</span>
          ) : (
            <span className="rounded bg-violet-100 px-1.5 py-0.5 font-medium text-violet-900">
              Grupo: {f.validationGroup?.name ?? "selecionado"}
            </span>
          )}
          {responsibleUserIds.length > 0 ? (
            <span className="rounded bg-sky-100 px-1.5 py-0.5 font-medium text-sky-900">+ responsáveis específicos</span>
          ) : null}
          <span className="text-slate-600">Efetivos: {effectiveSummary}</span>
        </div>
        <UserMultiSelect
          id={`feature-responsibles-${f.id}`}
          label="Responsáveis específicos do item (complementam o grupo)"
          value={responsibleUserIds}
          onChange={setResponsibleUserIds}
          linkedUsers={f.responsibleUsers ?? []}
          disabled={busy}
          placeholder="Somente membros do grupo"
          hint="Os selecionados complementam os membros do grupo de validação; não substituem o grupo."
        />
      </div>
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
