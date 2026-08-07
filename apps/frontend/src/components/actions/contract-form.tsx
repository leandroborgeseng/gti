"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  createContract,
  createFiscal,
  createSupplier,
  getContractFormData,
  getContractTypeCatalog,
  getFiscais,
  getGlpiAssignedGroupsCatalog,
  getHiringTypes,
  getMyPermissions,
  getOrganizations,
  getSuppliers,
  reportContractFormLoadFailure,
  updateContract,
  type Contract,
  type ContractTypeCatalogRecord,
  type Fiscal,
  type Supplier
} from "@/lib/api";
import { ContractGlpiGroupsField } from "@/components/contracts/contract-glpi-groups-field";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ContractPricingItemsEditor,
  pricingItemsFromContract,
  summarizePricingDraft,
  toPricingItemInputs,
  validatePricingDraft,
  type PricingDraftItem
} from "@/components/contracts/contract-pricing-items-editor";
import { queryKeys } from "@/lib/query-keys";
import { formatBrl } from "@/lib/format-brl";
import {
  collectRegularizationPendings,
  contractToFormDefaults,
  mergeCatalogOptionsWithLink,
  safeSelectValue
} from "@/modules/contracts/contract-form-helpers";
import {
  CONTRACT_FORM_DEFAULT_VALUES,
  contractPageSchema,
  createContractPageSchema,
  formatFormalNumberPreview,
  onlyDigits,
  onlyDigitsCnpj,
  quickFiscalSchema,
  quickSupplierSchema,
  type ContractPageFormInput,
  type ContractPageParsed
} from "@/modules/contracts/contract-form-schema";
import {
  CONTRACT_STATUS_OPTIONS,
  contractStatusConfirmationCopy,
  isContractLifecycleStatus,
  type ContractLifecycleStatus
} from "@/modules/contracts/contract-status";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormSection } from "@/components/ui/form-primitives";
import { EntitySelectWithCreate } from "@/components/ui/entity-select-with-create";

type Props = {
  onSuccess?: () => void;
  /** Chamado quando o usuário pede para fechar após falha técnica irrecuperável. */
  onDismiss?: () => void;
  /** Se definido, o formulário passa a modo edição (`PUT /contracts/:id`). */
  initialContract?: Contract | null;
};

function AdminCatalogLink({
  tab,
  label,
  enabled
}: {
  tab: "orgaos" | "tipos-contrato" | "tipos-contratacao" | "tipos-itens";
  label: string;
  enabled: boolean;
}): JSX.Element | null {
  if (!enabled) return null;
  return (
    <a
      href={`/administracao?tab=${tab}`}
      target="_blank"
      rel="noopener noreferrer"
      className="ml-1 font-medium text-primary underline underline-offset-2"
    >
      {label}
    </a>
  );
}

function CatalogFieldHint({
  emptyMessage,
  loadError,
  onRetry,
  adminTab,
  adminLabel,
  canAdmin
}: {
  emptyMessage: string;
  loadError?: string | null;
  onRetry?: () => void;
  adminTab?: "orgaos" | "tipos-contrato" | "tipos-contratacao" | "tipos-itens";
  adminLabel?: string;
  canAdmin?: boolean;
}): JSX.Element | null {
  if (loadError) {
    return (
      <p className="text-sm text-amber-800">
        {loadError}{" "}
        {onRetry ? (
          <button type="button" className="font-medium underline underline-offset-2" onClick={onRetry}>
            Tentar novamente
          </button>
        ) : null}
      </p>
    );
  }
  return (
    <p className="text-sm text-amber-800">
      {emptyMessage}
      {adminTab && adminLabel ? (
        <AdminCatalogLink tab={adminTab} label={adminLabel} enabled={Boolean(canAdmin)} />
      ) : null}
    </p>
  );
}

function catalogPayloadFields(data: ContractPageParsed): {
  formalNumber?: string;
  administrativeProcess?: string | null;
  organizationId?: string | null;
  contractTypeCatalogId?: string | null;
  contractType: ContractPageParsed["contractType"];
  hiringTypeId?: string | null;
  hiringProcedureNumber?: string | null;
  managingUnit?: string | null;
} {
  const adminProcess = data.administrativeProcess.trim();
  const hiringProc = data.hiringProcedureNumber.trim();
  const organizationId = data.organizationId.trim();
  const contractTypeCatalogId = data.contractTypeCatalogId.trim();
  return {
    ...(data.formalNumber ? { formalNumber: data.formalNumber } : {}),
    administrativeProcess: adminProcess || null,
    organizationId: organizationId || null,
    contractTypeCatalogId: contractTypeCatalogId || null,
    contractType: data.contractType,
    hiringTypeId: data.hiringTypeId.trim() || null,
    hiringProcedureNumber: hiringProc || null,
    managingUnit: organizationId ? null : data.managingUnit.trim() || null
  };
}

function globalValuePayload(data: ContractPageParsed) {
  if (!data.globalValueManual) {
    return { globalValueManual: false };
  }
  return {
    globalValueManual: true,
    globalValueCurrent: Number(data.globalValueCurrent.replace(",", ".")),
    globalValueJustification: data.globalValueJustification.trim()
  };
}

type FiscalModalRole = "fiscal" | "manager";

function formatCnpjHint(v: string): string {
  const d = onlyDigitsCnpj(v).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}

export function ContractForm({ onSuccess, onDismiss, initialContract = null }: Props): JSX.Element {
  const qc = useQueryClient();
  const isEdit = Boolean(initialContract?.id);
  const qPerms = useQuery({ queryKey: queryKeys.myPermissions, queryFn: getMyPermissions, staleTime: 60_000 });
  const canAdminCatalogs =
    qPerms.data?.role === "ADMIN" ||
    (qPerms.data?.keys ?? []).some(
      (k) =>
        k === "admin.organs.manage" ||
        k === "admin.organs.view" ||
        k.startsWith("admin.")
    );
  const qFiscais = useQuery({
    queryKey: queryKeys.fiscais,
    queryFn: getFiscais,
    retry: 1,
    throwOnError: false
  });
  const qSuppliers = useQuery({
    queryKey: queryKeys.suppliers,
    queryFn: getSuppliers,
    retry: 1,
    throwOnError: false
  });
  const qGlpiGroups = useQuery({
    queryKey: queryKeys.glpiAssignedGroups,
    queryFn: getGlpiAssignedGroupsCatalog,
    retry: 1,
    throwOnError: false
  });
  const qOrganizations = useQuery({
    queryKey: queryKeys.organizations,
    queryFn: getOrganizations,
    retry: 1,
    throwOnError: false
  });
  const qContractTypes = useQuery({
    queryKey: queryKeys.contractTypeCatalog,
    queryFn: getContractTypeCatalog,
    retry: 1,
    throwOnError: false
  });
  const qHiringTypes = useQuery({
    queryKey: queryKeys.hiringTypes,
    queryFn: getHiringTypes,
    retry: 1,
    throwOnError: false
  });
  const qContractDetail = useQuery({
    queryKey: queryKeys.contractFormData(initialContract?.id ?? ""),
    queryFn: () => getContractFormData(initialContract!.id),
    enabled: Boolean(initialContract?.id),
    retry: 1,
    throwOnError: false,
    // Lista já traz identificação; itens vêm do form-data.
    placeholderData: initialContract ?? undefined
  });
  const editContract = (qContractDetail.data ?? initialContract) as Contract | null;
  const detailLoadFailed = isEdit && qContractDetail.isError;
  const fiscais = qFiscais.data ?? [];
  const suppliers = qSuppliers.data ?? [];
  const organizationOptions = useMemo(
    () =>
      mergeCatalogOptionsWithLink(
        (qOrganizations.data ?? []).map((o) => ({
          id: o.id,
          name: o.name,
          acronym: o.acronym ?? "",
          active: o.active
        })),
        editContract?.organizationId,
        editContract?.organization
          ? {
              id: editContract.organization.id,
              name: editContract.organization.name,
              acronym: editContract.organization.acronym ?? "",
              active: editContract.organization.active
            }
          : null,
        "Órgão vinculado (indisponível)"
      ),
    [qOrganizations.data, editContract?.organizationId, editContract?.organization]
  );

  const contractTypeOptions = useMemo(
    () =>
      mergeCatalogOptionsWithLink(
        (qContractTypes.data ?? []).map((t) => ({
          id: t.id,
          name: t.name,
          acronym: t.acronym ?? "",
          active: t.active,
          legacyEnum: t.legacyEnum,
          sortOrder: t.sortOrder
        })),
        editContract?.contractTypeCatalogId,
        editContract?.contractTypeCatalog
          ? {
              id: editContract.contractTypeCatalog.id,
              name: editContract.contractTypeCatalog.name,
              acronym: editContract.contractTypeCatalog.acronym ?? "",
              legacyEnum:
                editContract.contractTypeCatalog.legacyEnum === "SOFTWARE" ||
                editContract.contractTypeCatalog.legacyEnum === "DATACENTER" ||
                editContract.contractTypeCatalog.legacyEnum === "INFRA" ||
                editContract.contractTypeCatalog.legacyEnum === "SERVICO"
                  ? editContract.contractTypeCatalog.legacyEnum
                  : null,
              active: false,
              sortOrder: 0
            }
          : null,
        "Tipo vinculado (indisponível)"
      ),
    [qContractTypes.data, editContract?.contractTypeCatalogId, editContract?.contractTypeCatalog]
  );

  const hiringTypeOptions = useMemo(
    () =>
      mergeCatalogOptionsWithLink(
        (qHiringTypes.data ?? []).map((t) => ({
          id: t.id,
          name: t.name,
          active: t.active,
          sortOrder: t.sortOrder
        })),
        editContract?.hiringTypeId,
        editContract?.hiringType
          ? { id: editContract.hiringType.id, name: editContract.hiringType.name, active: false, sortOrder: 0 }
          : null,
        "Modalidade vinculada (indisponível)"
      ),
    [qHiringTypes.data, editContract?.hiringTypeId, editContract?.hiringType]
  );
  const orgOptionIds = useMemo(() => new Set(organizationOptions.map((o) => o.id)), [organizationOptions]);
  const typeOptionIds = useMemo(() => new Set(contractTypeOptions.map((t) => t.id)), [contractTypeOptions]);
  const hiringOptionIds = useMemo(() => new Set(hiringTypeOptions.map((t) => t.id)), [hiringTypeOptions]);
  const catalogsLoading =
    qOrganizations.isPending || qContractTypes.isPending || qHiringTypes.isPending;
  const listsLoading = qFiscais.isPending || qSuppliers.isPending || catalogsLoading;

  const [fiscalModalRole, setFiscalModalRole] = useState<FiscalModalRole | null>(null);
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [newFiscalErr, setNewFiscalErr] = useState<string | null>(null);
  const [newSupplierErr, setNewSupplierErr] = useState<string | null>(null);
  const [pricingItems, setPricingItems] = useState<PricingDraftItem[]>([]);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [initNonce, setInitNonce] = useState(0);
  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false);
  const [pendingStatusSubmit, setPendingStatusSubmit] = useState<ContractPageParsed | null>(null);

  const form = useForm<ContractPageFormInput>({
    resolver: zodResolver(contractPageSchema),
    defaultValues: CONTRACT_FORM_DEFAULT_VALUES
  });

  const watchFormalNumber = form.watch("formalNumber");
  const watchStartDate = form.watch("startDate");
  const watchOrganizationId = form.watch("organizationId");
  const watchContractTypeCatalogId = form.watch("contractTypeCatalogId");
  const watchHiringTypeId = form.watch("hiringTypeId");
  const watchFiscalId = form.watch("fiscalId");
  const watchManagingUnit = form.watch("managingUnit");
  const watchGlobalValueManual = form.watch("globalValueManual");
  const watchGlobalValueCurrent = form.watch("globalValueCurrent");
  const formValues = form.watch();
  const pricingTotals = useMemo(() => summarizePricingDraft(pricingItems), [pricingItems]);
  const manualGlobalValue = Number(String(watchGlobalValueCurrent ?? "").replace(",", "."));
  const globalValueDifference =
    watchGlobalValueManual && Number.isFinite(manualGlobalValue)
      ? manualGlobalValue - pricingTotals.globalEstimated
      : null;
  const numberPreview = useMemo(
    () => formatFormalNumberPreview(String(watchFormalNumber ?? ""), String(watchStartDate ?? "")),
    [watchFormalNumber, watchStartDate]
  );

  const fiscalIdSet = useMemo(() => new Set(fiscais.map((f) => f.id)), [fiscais]);
  const regularizationPendings = useMemo(() => {
    if (!isEdit) return [];
    return collectRegularizationPendings(formValues, {
      organizationOptions,
      contractTypeOptions,
      hiringTypeOptions,
      fiscalIds: fiscalIdSet,
      managingUnitLegacy: editContract?.managingUnit ?? watchManagingUnit,
      contractTypeLegacy: editContract?.contractType ?? null
    });
  }, [
    isEdit,
    formValues,
    organizationOptions,
    contractTypeOptions,
    hiringTypeOptions,
    fiscalIdSet,
    editContract?.managingUnit,
    editContract?.contractType,
    watchManagingUnit
  ]);

  const logFormFailure = useCallback(
    (stage: string, message: string) => {
      void reportContractFormLoadFailure({
        action: isEdit ? "edit" : "create",
        contractId: initialContract?.id ?? null,
        stage,
        message
      }).catch(() => {
        /* logging best-effort */
      });
    },
    [isEdit, initialContract?.id]
  );

  const onContractTypeCatalogChange = useCallback(
    (catalogId: string, catalog?: ContractTypeCatalogRecord) => {
      form.setValue("contractTypeCatalogId", catalogId, { shouldValidate: true });
      const legacy = catalog?.legacyEnum;
      if (legacy === "SOFTWARE" || legacy === "DATACENTER" || legacy === "INFRA" || legacy === "SERVICO") {
        form.setValue("contractType", legacy, { shouldValidate: true });
      }
    },
    [form]
  );

  useEffect(() => {
    if (qContractDetail.isError && initialContract?.id) {
      const msg =
        qContractDetail.error instanceof Error
          ? qContractDetail.error.message
          : "Falha ao carregar detalhe do contrato";
      logFormFailure("contract_form_data", msg);
    }
  }, [qContractDetail.isError, qContractDetail.error, initialContract?.id, logFormFailure]);

  useEffect(() => {
    try {
      if (isEdit) {
        // Aguarda catálogos para evitar Select com value sem opção correspondente (crash do Radix).
        if (catalogsLoading) return;
        const source = editContract ?? initialContract;
        form.reset(contractToFormDefaults(source));
        try {
          setPricingItems(pricingItemsFromContract(source?.pricingItems));
        } catch (pricingErr) {
          setPricingItems([]);
          logFormFailure(
            "pricing_items_map",
            pricingErr instanceof Error ? pricingErr.message : "Falha ao mapear itens"
          );
        }
      } else {
        form.reset(CONTRACT_FORM_DEFAULT_VALUES);
        setPricingItems([]);
      }
      setPricingError(null);
      setInitError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao preparar o formulário";
      console.error("Falha ao preparar formulário do contrato", err);
      setInitError(
        "Não foi possível preparar alguns dados do formulário. Você pode tentar novamente ou voltar à listagem."
      );
      logFormFailure("form_reset", message);
      // Mantém formulário utilizável com defaults seguros.
      form.reset(CONTRACT_FORM_DEFAULT_VALUES);
      setPricingItems([]);
    }
  }, [
    editContract?.id,
    editContract?.updatedAt,
    editContract?.pricingItems,
    form,
    editContract,
    catalogsLoading,
    isEdit,
    initialContract,
    initNonce,
    logFormFailure
  ]);

  const createFiscalMut = useMutation({
    mutationFn: async (vars: { name: string; email: string; phone: string; role: FiscalModalRole }) => {
      const created = await createFiscal({ name: vars.name, email: vars.email, phone: vars.phone });
      return { created, role: vars.role };
    },
    onSuccess: ({ created, role }: { created: Fiscal; role: FiscalModalRole }) => {
      toast.success("Fiscal cadastrado.");
      void qc.invalidateQueries({ queryKey: queryKeys.fiscais });
      if (role === "fiscal") {
        form.setValue("fiscalId", created.id, { shouldValidate: true });
        form.clearErrors("fiscalId");
      } else {
        form.setValue("managerId", created.id, { shouldValidate: true });
        form.clearErrors("managerId");
      }
      form.setValue("quickFiscalName", "");
      form.setValue("quickFiscalEmail", "");
      form.setValue("quickFiscalPhone", "");
      setNewFiscalErr(null);
      setFiscalModalRole(null);
    },
    onError: (e: unknown) => {
      setNewFiscalErr(e instanceof Error ? e.message : String(e));
    }
  });

  const createSupplierMut = useMutation({
    mutationFn: (vars: { name: string; cnpj: string }) => createSupplier({ name: vars.name, cnpj: vars.cnpj }),
    onSuccess: (created: Supplier) => {
      toast.success("Fornecedor cadastrado.");
      void qc.invalidateQueries({ queryKey: queryKeys.suppliers });
      form.setValue("supplierId", created.id, { shouldValidate: true });
      form.setValue("companyName", created.name);
      form.setValue("cnpj", created.cnpj);
      form.clearErrors(["supplierId", "companyName", "cnpj"]);
      form.setValue("quickSupplierName", "");
      form.setValue("quickSupplierCnpj", "");
      setNewSupplierErr(null);
      setSupplierModalOpen(false);
    },
    onError: (e: unknown) => {
      setNewSupplierErr(e instanceof Error ? e.message : String(e));
    }
  });

  const createContractMut = useMutation({
    mutationFn: createContract,
    onSuccess: () => {
      toast.success("Contrato cadastrado.");
      void qc.invalidateQueries({ queryKey: queryKeys.contracts });
      form.reset(CONTRACT_FORM_DEFAULT_VALUES);
      setPricingItems([]);
      setPricingError(null);
      onSuccess?.();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar contrato");
    }
  });

  const updateContractMut = useMutation({
    mutationFn: async ({
      id,
      data,
      items
    }: {
      id: string;
      data: ContractPageParsed;
      items: PricingDraftItem[];
    }) => {
      const totals = summarizePricingDraft(items);
      const implS = (data.implementationPeriodStart ?? "").trim();
      const implE = (data.implementationPeriodEnd ?? "").trim();
      return updateContract(id, {
        ...(data.number.trim() ? { number: data.number.trim() } : {}),
        ...catalogPayloadFields(data),
        name: data.name.trim(),
        description: data.description.trim() || null,
        companyName: data.companyName.trim(),
        cnpj: data.cnpj,
        lawType: data.lawType || undefined,
        status: data.status,
        startDate: data.startDate,
        endDate: data.endDate,
        monthlyValue: totals.monthlyValue,
        installationValue: totals.installationValue,
        ...globalValuePayload(data),
        implementationPeriodStart: implS ? implS : null,
        implementationPeriodEnd: implE ? implE : null,
        fiscalId: data.fiscalId,
        managerId: data.managerId.trim() || undefined,
        supplierId: data.supplierId.trim() || null,
        glpiGroups: data.glpiGroups,
        pricingItems: toPricingItemInputs(items)
      });
    },
    onSuccess: () => {
      toast.success("Contrato atualizado.");
      setStatusConfirmOpen(false);
      setPendingStatusSubmit(null);
      void qc.invalidateQueries({ queryKey: queryKeys.contracts });
      void qc.invalidateQueries({ queryKey: queryKeys.glpiAssignedGroups });
      onSuccess?.();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar contrato");
    }
  });

  const fiscalOptions = useMemo(
    () => fiscais.map((f: Fiscal) => ({ value: f.id, label: `${f.name} · ${f.email}` })),
    [fiscais]
  );

  const supplierOptions = useMemo(
    () => suppliers.map((s: Supplier) => ({ value: s.id, label: `${s.name} (${onlyDigitsCnpj(s.cnpj)})` })),
    [suppliers]
  );

  const onSupplierSelect = useCallback(
    (id: string) => {
      form.setValue("supplierId", id, { shouldValidate: true });
      form.clearErrors(["supplierId", "companyName", "cnpj"]);
      if (!id) return;
      const s = suppliers.find((x: Supplier) => x.id === id);
      if (s) {
        form.setValue("companyName", s.name);
        form.setValue("cnpj", s.cnpj);
      }
    },
    [form, suppliers]
  );

  const openFiscalModal = useCallback((role: FiscalModalRole) => {
    form.setValue("quickFiscalName", "");
    form.setValue("quickFiscalEmail", "");
    form.setValue("quickFiscalPhone", "");
    setNewFiscalErr(null);
    setFiscalModalRole(role);
  }, [form]);

  function submitNewFiscal(): void {
    setNewFiscalErr(null);
    if (!fiscalModalRole) return;
    const r = quickFiscalSchema.safeParse(form.getValues());
    if (!r.success) {
      const msg = r.error.flatten().fieldErrors;
      const first = Object.values(msg).flat()[0];
      setNewFiscalErr(typeof first === "string" ? first : "Verifique os campos.");
      return;
    }
    createFiscalMut.mutate({
      name: r.data.quickFiscalName.trim(),
      email: r.data.quickFiscalEmail.trim(),
      phone: r.data.quickFiscalPhone.trim(),
      role: fiscalModalRole
    });
  }

  function submitNewSupplier(): void {
    setNewSupplierErr(null);
    const r = quickSupplierSchema.safeParse(form.getValues());
    if (!r.success) {
      const msg = r.error.flatten().fieldErrors;
      const first = Object.values(msg).flat()[0];
      setNewSupplierErr(typeof first === "string" ? first : "Verifique os campos.");
      return;
    }
    createSupplierMut.mutate({
      name: r.data.quickSupplierName.trim(),
      cnpj: r.data.quickSupplierCnpj
    });
  }

  function executeSubmit(data: ContractPageParsed): void {
    const pricingMsg = validatePricingDraft(pricingItems);
    setPricingError(pricingMsg);
    if (pricingMsg) {
      toast.error(pricingMsg);
      return;
    }
    const totals = summarizePricingDraft(pricingItems);
    const itemsPayload = toPricingItemInputs(pricingItems);
    if (initialContract) {
      updateContractMut.mutate({ id: initialContract.id, data, items: pricingItems });
      return;
    }
    const implS = (data.implementationPeriodStart ?? "").trim();
    const implE = (data.implementationPeriodEnd ?? "").trim();
    createContractMut.mutate({
      ...catalogPayloadFields(data),
      name: data.name.trim(),
      description: data.description.trim() || undefined,
      companyName: data.companyName.trim(),
      cnpj: data.cnpj,
      lawType: data.lawType || undefined,
      status: data.status,
      startDate: data.startDate,
      endDate: data.endDate,
      monthlyValue: totals.monthlyValue,
      ...(totals.installationValue != null ? { installationValue: totals.installationValue } : {}),
      ...globalValuePayload(data),
      ...(implS ? { implementationPeriodStart: implS } : {}),
      ...(implE ? { implementationPeriodEnd: implE } : {}),
      fiscalId: data.fiscalId,
      managerId: data.managerId.trim() || undefined,
      supplierId: data.supplierId.trim() || undefined,
      glpiGroups: data.glpiGroups.length > 0 ? data.glpiGroups : undefined,
      pricingItems: itemsPayload
    });
  }

  function onValidSubmit(raw: ContractPageFormInput): void {
    const schema = initialContract ? contractPageSchema : createContractPageSchema;
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      for (const [key, messages] of Object.entries(flat)) {
        const msg = messages?.[0];
        if (msg) {
          form.setError(key as keyof ContractPageFormInput, { type: "manual", message: msg });
        }
      }
      const first = Object.values(flat).flat()[0];
      toast.error(typeof first === "string" ? first : "Verifique os campos obrigatórios do formulário.");
      return;
    }
    const data = parsed.data;
    const previousStatus = initialContract?.status ?? "ACTIVE";
    if (
      initialContract &&
      isContractLifecycleStatus(data.status) &&
      data.status !== previousStatus
    ) {
      setPendingStatusSubmit(data);
      setStatusConfirmOpen(true);
      return;
    }
    executeSubmit(data);
  }

  const statusConfirmTexts =
    pendingStatusSubmit != null
      ? contractStatusConfirmationCopy(
          initialContract?.status ?? "ACTIVE",
          pendingStatusSubmit.status as ContractLifecycleStatus
        )
      : { title: "", description: "" };

  const sameAsFiscal = useCallback(() => {
    const fid = form.getValues("fiscalId");
    if (!fid) {
      form.setError("managerId", { type: "manual", message: "Defina primeiro o fiscal." });
      return;
    }
    form.setValue("managerId", fid, { shouldValidate: true });
    form.clearErrors("managerId");
  }, [form]);

  return (
    <Form {...form}>
      <form className="space-y-5" onSubmit={form.handleSubmit(onValidSubmit)}>
        {listsLoading ? (
          <p className="text-sm text-muted-foreground">Carregando cadastros auxiliares…</p>
        ) : null}
        {detailLoadFailed ? (
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <p>
              Não foi possível recarregar o detalhe completo deste contrato. Os dados disponíveis foram carregados; itens
              contratuais e vínculos recentes podem estar incompletos.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  void qc.invalidateQueries({ queryKey: queryKeys.contractFormData(initialContract!.id) });
                  setInitNonce((n) => n + 1);
                }}
              >
                Tentar novamente
              </Button>
              {onDismiss ? (
                <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
                  Voltar à listagem
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        {initError ? (
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <p>{initError}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setInitNonce((n) => n + 1)}>
                Tentar novamente
              </Button>
              {onDismiss ? (
                <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
                  Voltar à listagem
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        {isEdit && regularizationPendings.length > 0 ? (
          <div
            className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-sm text-slate-800"
            role="region"
            aria-label="Pendências de regularização"
          >
            <p className="font-medium text-slate-900">Pendências de regularização</p>
            <p className="mt-0.5 text-xs text-slate-600">
              Campos abaixo precisam de atenção. O restante do formulário permanece editável.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {regularizationPendings.map((p) => (
                <li key={p.field}>
                  <button
                    type="button"
                    className="text-left font-medium text-primary underline-offset-2 hover:underline"
                    onClick={() => {
                      document.getElementById(p.anchorId)?.scrollIntoView({ behavior: "smooth", block: "center" });
                      document.getElementById(p.anchorId)?.focus?.();
                    }}
                  >
                    {p.label}
                  </button>
                  <span className="text-slate-700"> — {p.message}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {isEdit && editContract?.managingUnit && !watchOrganizationId ? (
          <p className="text-sm text-muted-foreground">
            Referência legada de órgão: <strong>{editContract.managingUnit}</strong>. Selecione o órgão correspondente na
            lista abaixo.
          </p>
        ) : null}

        <FormSection
          title="Identificação do contrato"
          description="Número formal, órgão gestor e tipo conforme cadastros da Administração. O código interno SIGTI é gerado automaticamente ao salvar."
        >
          <FormField
            control={form.control}
            name="formalNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Número formal {initialContract ? "(opcional na edição)" : ""}</FormLabel>
                <FormControl>
                  <Input
                    id="field-formalNumber"
                    placeholder="Somente dígitos (ex.: 370)"
                    inputMode="numeric"
                    autoComplete="off"
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(onlyDigits(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormItem>
            <FormLabel>Número completo (pré-visualização)</FormLabel>
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm font-medium text-foreground">{numberPreview}</div>
            <FormDescription>
              Formato número/ano: o ano vem do início da vigência.{" "}
              {editContract?.internalCode ? (
                <>Código interno atual: <strong>{editContract.internalCode}</strong>.</>
              ) : (
                <>O código interno (ex.: ST-2026-001) será gerado ao salvar.</>
              )}
            </FormDescription>
          </FormItem>
          <FormField
            control={form.control}
            name="administrativeProcess"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Processo administrativo (opcional)</FormLabel>
                <FormControl>
                  <Input placeholder="Ex.: 23.911/2022" autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="organizationId"
            render={({ field }) => (
              <FormItem className="sm:col-span-2" id="field-organizationId">
                <FormLabel>Órgão gestor</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={safeSelectValue(field.value, orgOptionIds)}
                  disabled={catalogsLoading}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={catalogsLoading ? "Carregando…" : "Selecione o órgão"} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {organizationOptions.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.acronym ? `${org.acronym} · ${org.name}` : org.name}
                        {org.active === false ? " (Inativo)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!catalogsLoading && organizationOptions.filter((o) => o.active !== false).length === 0 ? (
                  <CatalogFieldHint
                    emptyMessage="Nenhum órgão ativo está disponível."
                    loadError={
                      qOrganizations.isError
                        ? "Não foi possível carregar a lista de órgãos."
                        : null
                    }
                    onRetry={() => void qc.invalidateQueries({ queryKey: queryKeys.organizations })}
                    adminTab="orgaos"
                    adminLabel="Abrir cadastro de órgãos"
                    canAdmin={canAdminCatalogs}
                  />
                ) : null}
                {field.value && !orgOptionIds.has(field.value) ? (
                  <p className="text-sm text-amber-800">
                    Há um órgão vinculado que não está na lista atual. Selecione um registro correspondente.
                  </p>
                ) : null}
                <FormMessage />
              </FormItem>
            )}
          />
          {!watchOrganizationId ? (
            <FormField
              control={form.control}
              name="managingUnit"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Órgão gestor (texto legado — referência)</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex.: SEC. ADM. E RH" autoComplete="organization" {...field} />
                  </FormControl>
                  <FormDescription>
                    Valor legado apenas como referência. Regularize selecionando o órgão no cadastro central acima.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}
          <FormField
            control={form.control}
            name="contractTypeCatalogId"
            render={({ field }) => (
              <FormItem id="field-contractTypeCatalogId">
                <FormLabel>Tipo de contrato</FormLabel>
                <Select
                  onValueChange={(id) => {
                    const catalog = contractTypeOptions.find((t) => t.id === id);
                    onContractTypeCatalogChange(id, catalog as ContractTypeCatalogRecord | undefined);
                  }}
                  value={safeSelectValue(field.value, typeOptionIds)}
                  disabled={catalogsLoading}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={catalogsLoading ? "Carregando…" : "Selecione o tipo"} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {contractTypeOptions.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.acronym ? `${t.acronym} · ${t.name}` : t.name}
                        {t.active === false ? " (Inativo)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!catalogsLoading && contractTypeOptions.filter((t) => t.active !== false).length === 0 ? (
                  <CatalogFieldHint
                    emptyMessage="Nenhum tipo de contrato ativo foi cadastrado."
                    loadError={
                      qContractTypes.isError
                        ? "Não foi possível carregar os tipos de contrato."
                        : null
                    }
                    onRetry={() => void qc.invalidateQueries({ queryKey: queryKeys.contractTypeCatalog })}
                    adminTab="tipos-contrato"
                    adminLabel="Abrir tipos de contrato"
                    canAdmin={canAdminCatalogs}
                  />
                ) : null}
                {isEdit && !watchContractTypeCatalogId && editContract?.contractType ? (
                  <FormDescription>
                    Classificação legada: {editContract.contractType}. Selecione o tipo correspondente no catálogo.
                  </FormDescription>
                ) : null}
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="hiringTypeId"
            render={({ field }) => (
              <FormItem id="field-hiringTypeId">
                <FormLabel>Modalidade de contratação (opcional)</FormLabel>
                <Select
                  onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}
                  value={
                    field.value?.trim() && hiringOptionIds.has(field.value)
                      ? field.value
                      : "__none__"
                  }
                  disabled={catalogsLoading}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="- Nenhuma -" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="__none__">- Nenhuma -</SelectItem>
                    {hiringTypeOptions.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                        {t.active === false ? " (Inativo)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!catalogsLoading && hiringTypeOptions.filter((t) => t.active !== false).length === 0 ? (
                  <CatalogFieldHint
                    emptyMessage="Nenhum tipo de contratação ativo está disponível."
                    loadError={
                      qHiringTypes.isError
                        ? "Não foi possível carregar os tipos de contratação."
                        : null
                    }
                    onRetry={() => void qc.invalidateQueries({ queryKey: queryKeys.hiringTypes })}
                    adminTab="tipos-contratacao"
                    adminLabel="Abrir tipos de contratação"
                    canAdmin={canAdminCatalogs}
                  />
                ) : null}
                {!watchHiringTypeId && isEdit ? (
                  <FormDescription>Sem modalidade vinculada — pode permanecer em branco até a regularização.</FormDescription>
                ) : null}
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="hiringProcedureNumber"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Nº do procedimento licitatório (opcional)</FormLabel>
                <FormControl>
                  <Input placeholder="NNNN/AAAA (ex.: 0156/2022)" autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Nome / objeto resumido</FormLabel>
                <FormControl>
                  <Input placeholder="Denominação do contrato" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="lawType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Lei aplicável</FormLabel>
                <Select
                  onValueChange={(v) => field.onChange(v === "__default__" ? "" : v)}
                  value={field.value === "" ? "__default__" : field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Padrão do sistema" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="__default__">Padrão do sistema</SelectItem>
                    <SelectItem value="LEI_8666">Lei 8.666/93</SelectItem>
                    <SelectItem value="LEI_14133">Lei 14.133/21</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>Se vazio, o servidor usa a regra por padrão (14133).</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || "ACTIVE"}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {CONTRACT_STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  {isEdit
                    ? "A alteração do status é salva junto com o restante do cadastro. Situações sensíveis pedem confirmação."
                    : "Situação inicial do contrato após o cadastro."}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <FormSection
          title="Fornecedor"
          description="Vincule a um cadastro existente ou preencha manualmente. Novo fornecedor abre em um modal sem sair desta página."
        >
          <div className="sm:col-span-2">
            <Controller
              control={form.control}
              name="supplierId"
              render={({ field }) => (
                <EntitySelectWithCreate
                  id="c-supplier"
                  label="Fornecedor cadastrado (opcional)"
                  value={field.value}
                  onChange={(id) => {
                    field.onChange(id);
                    onSupplierSelect(id);
                  }}
                  options={supplierOptions}
                  placeholder="- Nenhum; preencher manualmente abaixo -"
                  addNewLabel="+ Novo fornecedor"
                  onAddNew={() => {
                    form.setValue("quickSupplierName", "");
                    form.setValue("quickSupplierCnpj", "");
                    setNewSupplierErr(null);
                    setSupplierModalOpen(true);
                  }}
                  disabled={listsLoading}
                  hint="Ao selecionar, a razão social e o CNPJ são preenchidos automaticamente (pode ajustar antes de salvar)."
                />
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="companyName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Razão social</FormLabel>
                <FormControl>
                  <Input placeholder="Razão social no contrato" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="cnpj"
            render={({ field }) => (
              <FormItem>
                <FormLabel>CNPJ</FormLabel>
                <FormControl>
                  <Input placeholder="00.000.000/0000-00" inputMode="numeric" {...field} />
                </FormControl>
                <FormDescription>Formato sugerido: {formatCnpjHint(field.value || "00000000000000")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <FormSection
          title="Integração GLPI"
          description="Opcional. Vincule um ou mais grupos de trabalho do GLPI para relacionar chamados e acompanhar SLA."
        >
          <FormField
            control={form.control}
            name="glpiGroups"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Grupos GLPI vinculados</FormLabel>
                <FormControl>
                  <ContractGlpiGroupsField
                    id="field-glpiGroups"
                    catalog={qGlpiGroups.data ?? []}
                    value={field.value ?? []}
                    onChange={field.onChange}
                    disabled={qGlpiGroups.isPending}
                    loading={qGlpiGroups.isPending}
                    loadError={
                      qGlpiGroups.isError
                        ? "Não foi possível carregar os grupos GLPI. Tente novamente mais tarde."
                        : null
                    }
                    maxVisibleChips={2}
                  />
                </FormControl>
                <FormDescription>
                  Selecione apenas grupos identificados no GLPI (API e chamados sincronizados). Não é possível digitar
                  nomes livres.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <FormSection title="Responsáveis" description="Fiscal e gestor vêm da mesma lista de fiscais; pode cadastrar novo sem sair da página.">
          <div className="sm:col-span-2">
            <Controller
              control={form.control}
              name="fiscalId"
              render={({ field, fieldState }) => (
                <div id="field-fiscalId">
                  <EntitySelectWithCreate
                    id="c-fiscal"
                    label="Fiscal"
                    required
                    value={field.value ?? ""}
                    onChange={(v) => {
                      field.onChange(v);
                      form.clearErrors("fiscalId");
                    }}
                    options={fiscalOptions}
                    placeholder="Selecione o fiscal"
                    addNewLabel="+ Novo fiscal"
                    onAddNew={() => openFiscalModal("fiscal")}
                    disabled={qFiscais.isPending}
                    error={fieldState.error?.message}
                  />
                  {qFiscais.isError ? (
                    <CatalogFieldHint
                      emptyMessage=""
                      loadError="Não foi possível carregar a lista de fiscais."
                      onRetry={() => void qc.invalidateQueries({ queryKey: queryKeys.fiscais })}
                    />
                  ) : null}
                  {!qFiscais.isPending && !qFiscais.isError && fiscais.length === 0 ? (
                    <p className="mt-1 text-sm text-amber-800">Nenhum fiscal cadastrado. Use «+ Novo fiscal».</p>
                  ) : null}
                </div>
              )}
            />
          </div>
          <div className="sm:col-span-2">
            <Controller
              control={form.control}
              name="managerId"
              render={({ field, fieldState }) => (
                <EntitySelectWithCreate
                  id="c-manager"
                  label="Gestor (opcional)"
                  value={field.value}
                  onChange={(v) => {
                    field.onChange(v);
                    form.clearErrors("managerId");
                  }}
                  options={fiscalOptions}
                  placeholder="- Igual ao fiscal (omissão no servidor) -"
                  addNewLabel="+ Novo gestor"
                  onAddNew={() => openFiscalModal("manager")}
                  disabled={listsLoading}
                  error={fieldState.error?.message}
                  hint="Se não selecionar, o servidor assume o mesmo fiscal como gestor."
                />
              )}
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={sameAsFiscal} disabled={!watchFiscalId}>
              Usar o fiscal selecionado como gestor
            </Button>
          </div>
        </FormSection>

        <FormSection
          title="Vigência"
          description="Período de vigência do contrato. O período de implantação (opcional) orienta o painel de proporcionalidade entre implantação e mensalidade."
        >
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem id="field-startDate">
                <FormLabel>Início da vigência</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fim da vigência</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="implementationPeriodStart"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Início do período de implantação</FormLabel>
                <FormControl>
                  <Input type="date" {...field} value={field.value ?? ""} />
                </FormControl>
                <FormDescription>
                  Opcional. Com início e fim definidos, o painel de proporcionalidade destaca implantação ou mensalidade
                  conforme a data de hoje.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="implementationPeriodEnd"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fim do período de implantação</FormLabel>
                <FormControl>
                  <Input type="date" {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <FormSection
          title="Itens contratuais"
          description="Registre mensalidade, implantação, horas, UST, equipamentos, licenças e demais itens precificados. A descrição livre e o tipo padronizado são complementares: não se substituem. O valor total é calculado automaticamente (quantidade × unitário), salvo indicação manual justificada."
        >
          <ContractPricingItemsEditor
            value={pricingItems}
            onChange={(next) => {
              setPricingItems(next);
              if (pricingError) setPricingError(validatePricingDraft(next));
            }}
            lockHardDelete={Boolean(editContract?.pricingLocked)}
            error={pricingError}
          />
          {initialContract && qContractDetail.isPending && !editContract?.pricingItems ? (
            <p className="sm:col-span-2 text-sm text-muted-foreground">Carregando itens contratuais…</p>
          ) : null}
        </FormSection>

        <FormSection
          title="Valor global"
          description="O valor global é estimado pelos itens contratuais. Use ajuste manual apenas em situação excepcional e registre a justificativa."
        >
          <FormItem>
            <FormLabel>Estimativa calculada pelos itens</FormLabel>
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm font-medium text-foreground">
              {formatBrl(pricingTotals.globalEstimated)}
            </div>
            <FormDescription>
              Recorrentes: {formatBrl(pricingTotals.recurringPredicted)} · Únicos: {formatBrl(pricingTotals.oneTime)} · Sob demanda:{" "}
              {formatBrl(pricingTotals.onDemand)}
            </FormDescription>
          </FormItem>
          <FormField
            control={form.control}
            name="globalValueManual"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start gap-3 space-y-0 rounded-md border p-3 sm:col-span-2">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={(value) => field.onChange(value === true)} />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Ajuste manual excepcional</FormLabel>
                  <FormDescription>
                    Preserva a estimativa dos itens e exige informar o motivo do valor global informado.
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />
          {watchGlobalValueManual ? (
            <>
              <FormField
                control={form.control}
                name="globalValueCurrent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valor global ajustado</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="0.01" inputMode="decimal" placeholder="0,00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormItem>
                <FormLabel>Diferença em relação aos itens</FormLabel>
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm font-medium text-foreground">
                  {globalValueDifference == null
                    ? "Informe o valor ajustado."
                    : `${globalValueDifference >= 0 ? "+" : "−"} ${formatBrl(Math.abs(globalValueDifference))}`}
                </div>
              </FormItem>
              <FormField
                control={form.control}
                name="globalValueJustification"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Justificativa do ajuste</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder="Explique por que o valor global difere da estimativa dos itens."
                        className="min-h-[88px] resize-y"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          ) : null}
        </FormSection>

        <FormSection title="Descrição" description="Opcional: objeto ou observações.">
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Texto livre</FormLabel>
                <FormControl>
                  <Textarea rows={3} placeholder="Objeto ou observações" className="min-h-[88px] resize-y" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            disabled={createContractMut.isPending || updateContractMut.isPending}
          >
            {initialContract
              ? updateContractMut.isPending
                ? "Salvando…"
                : "Salvar alterações"
              : createContractMut.isPending
                ? "Salvando…"
                : "Salvar contrato"}
          </Button>
          {onDismiss ? (
            <Button type="button" variant="outline" onClick={onDismiss}>
              Voltar à listagem
            </Button>
          ) : null}
        </div>

        <Modal
          open={fiscalModalRole !== null}
          onClose={() => setFiscalModalRole(null)}
          title={fiscalModalRole === "manager" ? "Novo gestor (fiscal)" : "Novo fiscal"}
          description="Os dados ficam salvos na lista de fiscais e são selecionados automaticamente neste contrato."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="quickFiscalName"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input placeholder="Nome completo" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="quickFiscalEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-mail</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="email@org.br" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="quickFiscalPhone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefone</FormLabel>
                  <FormControl>
                    <Input placeholder="(00) 00000-0000" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {newFiscalErr ? <p className="sm:col-span-2 text-sm text-destructive">{newFiscalErr}</p> : null}
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button type="button" disabled={createFiscalMut.isPending} onClick={() => submitNewFiscal()}>
                {createFiscalMut.isPending ? "Salvando…" : "Salvar e selecionar"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setFiscalModalRole(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        </Modal>

        <Modal
          open={supplierModalOpen}
          onClose={() => setSupplierModalOpen(false)}
          title="Novo fornecedor"
          description="Após salvar, o fornecedor passa a constar na lista e os campos do contrato são preenchidos."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="quickSupplierName"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Razão social</FormLabel>
                  <FormControl>
                    <Input placeholder="Nome do fornecedor" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="quickSupplierCnpj"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>CNPJ</FormLabel>
                  <FormControl>
                    <Input placeholder="Somente números ou com máscara" inputMode="numeric" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {newSupplierErr ? <p className="sm:col-span-2 text-sm text-destructive">{newSupplierErr}</p> : null}
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button type="button" disabled={createSupplierMut.isPending} onClick={() => submitNewSupplier()}>
                {createSupplierMut.isPending ? "Salvando…" : "Salvar e selecionar"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setSupplierModalOpen(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        </Modal>

        <Modal
          open={statusConfirmOpen && pendingStatusSubmit != null}
          onClose={() => {
            if (updateContractMut.isPending) return;
            setStatusConfirmOpen(false);
            setPendingStatusSubmit(null);
          }}
          title={statusConfirmTexts.title}
          description={statusConfirmTexts.description}
        >
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={updateContractMut.isPending}
              onClick={() => {
                setStatusConfirmOpen(false);
                setPendingStatusSubmit(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={updateContractMut.isPending || !pendingStatusSubmit}
              onClick={() => {
                if (!pendingStatusSubmit) return;
                executeSubmit(pendingStatusSubmit);
              }}
            >
              {updateContractMut.isPending ? "Salvando…" : "Confirmar e salvar"}
            </Button>
          </div>
        </Modal>
      </form>
    </Form>
  );
}
