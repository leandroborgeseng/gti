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
  getContract,
  getContractTypeCatalog,
  getFiscais,
  getGlpiAssignedGroupsCatalog,
  getHiringTypes,
  getOrganizations,
  getSuppliers,
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
  CONTRACT_FORM_DEFAULT_VALUES,
  contractPageSchema,
  createContractPageSchema,
  formatFormalNumberPreview,
  formalNumberFromContract,
  onlyDigits,
  onlyDigitsCnpj,
  quickFiscalSchema,
  quickSupplierSchema,
  type ContractPageFormInput,
  type ContractPageParsed
} from "@/modules/contracts/contract-form-schema";
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
  /** Se definido, o formulário passa a modo edição (`PUT /contracts/:id`). */
  initialContract?: Contract | null;
};

function contractToFormDefaults(c: Contract): ContractPageFormInput {
  const cnpjDigits = onlyDigitsCnpj(c.cnpj ?? c.supplier?.cnpj ?? "");
  const lt = (c.lawType ?? "") as ContractPageFormInput["lawType"];
  const ct = c.contractType as ContractPageFormInput["contractType"];
  return {
    ...CONTRACT_FORM_DEFAULT_VALUES,
    formalNumber: formalNumberFromContract(c),
    number: c.number,
    administrativeProcess: c.administrativeProcess ?? "",
    organizationId: c.organizationId ?? "",
    contractTypeCatalogId: c.contractTypeCatalogId ?? "",
    contractType: ct,
    hiringTypeId: c.hiringTypeId ?? "",
    hiringProcedureNumber: c.hiringProcedureNumber ?? "",
    name: c.name,
    description: c.description ?? "",
    managingUnit: c.managingUnit ?? "",
    companyName: c.companyName,
    cnpj: cnpjDigits,
    lawType: lt === "LEI_8666" || lt === "LEI_14133" ? lt : "",
    startDate: c.startDate.slice(0, 10),
    endDate: c.endDate.slice(0, 10),
    monthlyValue: "",
    installationValue: "",
    globalValueManual: Boolean(c.globalValueManual),
    globalValueCurrent: c.globalValueManual ? String(c.globalValueCurrent ?? "") : "",
    globalValueJustification: c.globalValueManual ? c.globalValueJustification ?? "" : "",
    implementationPeriodStart:
      c.implementationPeriodStart && String(c.implementationPeriodStart).trim().length >= 10
        ? String(c.implementationPeriodStart).slice(0, 10)
        : "",
    implementationPeriodEnd:
      c.implementationPeriodEnd && String(c.implementationPeriodEnd).trim().length >= 10
        ? String(c.implementationPeriodEnd).slice(0, 10)
        : "",
    fiscalId: c.fiscal?.id ?? "",
    managerId: c.manager?.id ?? "",
    supplierId: c.supplier?.id ?? "",
    glpiGroups: (c.glpiGroups ?? []).map((g) => ({
      glpiGroupId: g.glpiGroupId,
      glpiGroupName: g.glpiGroupName ?? undefined
    }))
  };
}

function catalogPayloadFields(data: ContractPageParsed): {
  formalNumber?: string;
  administrativeProcess?: string | null;
  organizationId: string;
  contractTypeCatalogId: string;
  contractType: ContractPageParsed["contractType"];
  hiringTypeId?: string | null;
  hiringProcedureNumber?: string | null;
  managingUnit?: string | null;
} {
  const adminProcess = data.administrativeProcess.trim();
  const hiringProc = data.hiringProcedureNumber.trim();
  return {
    ...(data.formalNumber ? { formalNumber: data.formalNumber } : {}),
    administrativeProcess: adminProcess || null,
    organizationId: data.organizationId,
    contractTypeCatalogId: data.contractTypeCatalogId,
    contractType: data.contractType,
    hiringTypeId: data.hiringTypeId.trim() || null,
    hiringProcedureNumber: hiringProc || null,
    managingUnit: data.organizationId ? null : data.managingUnit.trim() || null
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

export function ContractForm({ onSuccess, initialContract = null }: Props): JSX.Element {
  const qc = useQueryClient();
  const qFiscais = useQuery({ queryKey: queryKeys.fiscais, queryFn: getFiscais });
  const qSuppliers = useQuery({ queryKey: queryKeys.suppliers, queryFn: getSuppliers });
  const qGlpiGroups = useQuery({ queryKey: queryKeys.glpiAssignedGroups, queryFn: getGlpiAssignedGroupsCatalog });
  const qOrganizations = useQuery({ queryKey: queryKeys.organizations, queryFn: getOrganizations });
  const qContractTypes = useQuery({ queryKey: queryKeys.contractTypeCatalog, queryFn: getContractTypeCatalog });
  const qHiringTypes = useQuery({ queryKey: queryKeys.hiringTypes, queryFn: getHiringTypes });
  const qContractDetail = useQuery({
    queryKey: [...queryKeys.contracts, "detail", initialContract?.id ?? ""] as const,
    queryFn: () => getContract(initialContract!.id),
    enabled: Boolean(initialContract?.id),
    initialData: initialContract?.pricingItems ? initialContract : undefined
  });
  const editContract = qContractDetail.data ?? initialContract;
  const fiscais = qFiscais.data ?? [];
  const suppliers = qSuppliers.data ?? [];
  const activeOrganizations = useMemo(
    () => (qOrganizations.data ?? []).filter((o) => o.active).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [qOrganizations.data]
  );
  const activeContractTypes = useMemo(
    () =>
      (qContractTypes.data ?? [])
        .filter((t) => t.active)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pt-BR")),
    [qContractTypes.data]
  );
  const activeHiringTypes = useMemo(
    () =>
      (qHiringTypes.data ?? [])
        .filter((t) => t.active)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pt-BR")),
    [qHiringTypes.data]
  );
  const catalogsLoading =
    qOrganizations.isPending || qContractTypes.isPending || qHiringTypes.isPending;
  const catalogsError =
    qOrganizations.error || qContractTypes.error || qHiringTypes.error
      ? [qOrganizations.error, qContractTypes.error, qHiringTypes.error]
          .filter(Boolean)
          .map((e) => (e instanceof Error ? e.message : String(e)))
          .join(" · ")
      : null;
  const listsLoading = qFiscais.isPending || qSuppliers.isPending || catalogsLoading;
  const listsError =
    qFiscais.error || qSuppliers.error || catalogsError
      ? [qFiscais.error, qSuppliers.error, catalogsError]
          .filter(Boolean)
          .map((e) => (e instanceof Error ? e.message : String(e)))
          .join(" · ")
      : null;

  const [fiscalModalRole, setFiscalModalRole] = useState<FiscalModalRole | null>(null);
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [newFiscalErr, setNewFiscalErr] = useState<string | null>(null);
  const [newSupplierErr, setNewSupplierErr] = useState<string | null>(null);
  const [pricingItems, setPricingItems] = useState<PricingDraftItem[]>([]);
  const [pricingError, setPricingError] = useState<string | null>(null);

  const form = useForm<ContractPageFormInput>({
    resolver: zodResolver(contractPageSchema),
    defaultValues: CONTRACT_FORM_DEFAULT_VALUES
  });

  const watchFormalNumber = form.watch("formalNumber");
  const watchStartDate = form.watch("startDate");
  const watchOrganizationId = form.watch("organizationId");
  const watchGlobalValueManual = form.watch("globalValueManual");
  const watchGlobalValueCurrent = form.watch("globalValueCurrent");
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
    if (editContract) {
      form.reset(contractToFormDefaults(editContract));
      if (editContract.pricingItems) {
        setPricingItems(pricingItemsFromContract(editContract.pricingItems));
      }
    } else {
      form.reset(CONTRACT_FORM_DEFAULT_VALUES);
      setPricingItems([]);
    }
    setPricingError(null);
  }, [editContract?.id, editContract?.updatedAt, form, editContract]);

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

  function onValidSubmit(raw: ContractPageFormInput): void {
    const schema = initialContract ? contractPageSchema : createContractPageSchema;
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.flatten().fieldErrors;
      const msg = Object.values(first).flat()[0];
      toast.error(typeof msg === "string" ? msg : "Verifique os campos do formulário.");
      return;
    }
    const data = parsed.data;
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
        {listsLoading ? <p className="text-sm text-muted-foreground">Carregando fiscais e fornecedores…</p> : null}
        {listsError ? <p className="text-sm text-destructive">{listsError}</p> : null}

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
              Formato número/ano — o ano vem do início da vigência.{" "}
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
              <FormItem className="sm:col-span-2">
                <FormLabel>Órgão gestor</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || undefined} disabled={catalogsLoading}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={catalogsLoading ? "Carregando…" : "Selecione o órgão"} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {activeOrganizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.acronym ? `${org.acronym} — ${org.name}` : org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  <FormLabel>Órgão gestor (texto legado)</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex.: SEC. ADM. E RH" autoComplete="organization" {...field} />
                  </FormControl>
                  <FormDescription>Use apenas se o órgão ainda não estiver no cadastro central.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}
          <FormField
            control={form.control}
            name="contractTypeCatalogId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo de contrato</FormLabel>
                <Select
                  onValueChange={(id) => {
                    const catalog = activeContractTypes.find((t) => t.id === id);
                    onContractTypeCatalogChange(id, catalog);
                  }}
                  value={field.value || undefined}
                  disabled={catalogsLoading}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={catalogsLoading ? "Carregando…" : "Selecione o tipo"} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {activeContractTypes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.acronym ? `${t.acronym} — ${t.name}` : t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="hiringTypeId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Modalidade de contratação (opcional)</FormLabel>
                <Select
                  onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}
                  value={field.value ? field.value : "__none__"}
                  disabled={catalogsLoading}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="— Nenhuma —" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="__none__">— Nenhuma —</SelectItem>
                    {activeHiringTypes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  placeholder="— Nenhum; preencher manualmente abaixo —"
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
          title="Grupos GLPI (SLA)"
          description="Opcional. Liga o contrato aos grupos de trabalho já vistos nos chamados sincronizados, para futuras métricas de SLA por contrato."
        >
          <FormField
            control={form.control}
            name="glpiGroups"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Grupos atribuídos no GLPI</FormLabel>
                <FormControl>
                  <ContractGlpiGroupsField
                    catalog={qGlpiGroups.data ?? []}
                    value={field.value ?? []}
                    onChange={field.onChange}
                    disabled={qGlpiGroups.isPending}
                  />
                </FormControl>
                <FormDescription>
                  Lista carregada a partir da API GLPI (grupos ativos) e de grupos já vistos nos chamados sincronizados.
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
                <EntitySelectWithCreate
                  id="c-fiscal"
                  label="Fiscal"
                  required
                  value={field.value}
                  onChange={(v) => {
                    field.onChange(v);
                    form.clearErrors("fiscalId");
                  }}
                  options={fiscalOptions}
                  placeholder="Selecione o fiscal"
                  addNewLabel="+ Novo fiscal"
                  onAddNew={() => openFiscalModal("fiscal")}
                  disabled={listsLoading}
                  error={fieldState.error?.message}
                />
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
                  placeholder="— Igual ao fiscal (omissão no servidor) —"
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
            <Button type="button" variant="outline" onClick={sameAsFiscal} disabled={listsLoading || Boolean(listsError) || !form.watch("fiscalId")}>
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
              <FormItem>
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
          description="Registre mensalidade, implantação, horas, UST, equipamentos, licenças e demais itens precificados. A descrição livre e o tipo padronizado são complementares — não se substituem. O valor total é calculado automaticamente (quantidade × unitário), salvo indicação manual justificada."
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

        <FormSection title="Descrição" description="Opcional — objeto ou observações.">
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
            disabled={
              listsLoading ||
              Boolean(listsError) ||
              createContractMut.isPending ||
              updateContractMut.isPending
            }
          >
            {initialContract
              ? updateContractMut.isPending
                ? "Salvando…"
                : "Salvar alterações"
              : createContractMut.isPending
                ? "Salvando…"
                : "Salvar contrato"}
          </Button>
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
      </form>
    </Form>
  );
}
