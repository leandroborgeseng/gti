"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  getContractFormData,
  getContractTypeCatalog,
  getFiscais,
  getGlpiAssignedGroupsCatalog,
  getHiringTypes,
  getMyPermissions,
  getOrganizations,
  getSuppliers,
  reportContractFormLoadFailure,
  type Contract,
  type ContractTypeCatalogRecord,
  type Fiscal,
  type GlpiAssignedGroupOption,
  type HiringTypeRecord,
  type OrganizationRecord,
  type Supplier
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import {
  asArray,
  errorMessage,
  logContractFormStage,
  type ContractFormLoadStage
} from "@/modules/contracts/contract-form-load";

type Args = {
  initialContract?: Contract | null;
};

export type ContractFormDependencyErrors = Partial<Record<ContractFormLoadStage, string>>;

/**
 * Carrega cada dependência do formulário de forma isolada.
 * Falha de uma consulta não cancela as demais nem impede a abertura da tela.
 */
export function useContractFormDependencies({ initialContract = null }: Args) {
  const isEdit = Boolean(initialContract?.id);
  const action: "create" | "edit" = isEdit ? "edit" : "create";
  const contractId = initialContract?.id ?? null;
  const reported = useRef<Set<string>>(new Set());

  const report = useCallback(
    (stage: ContractFormLoadStage, message: string) => {
      const key = `${stage}:${message}`;
      if (reported.current.has(key)) return;
      reported.current.add(key);
      logContractFormStage(action, contractId, stage, message);
      void reportContractFormLoadFailure({
        action,
        contractId,
        stage,
        message
      }).catch(() => {
        /* best-effort */
      });
    },
    [action, contractId]
  );

  const qPerms = useQuery({
    queryKey: queryKeys.myPermissions,
    queryFn: getMyPermissions,
    staleTime: 60_000,
    retry: 1,
    throwOnError: false
  });

  const qFiscais = useQuery({
    queryKey: queryKeys.fiscais,
    queryFn: async () => asArray<Fiscal>(await getFiscais()),
    retry: 1,
    throwOnError: false
  });

  const qSuppliers = useQuery({
    queryKey: queryKeys.suppliers,
    queryFn: async () => asArray<Supplier>(await getSuppliers()),
    retry: 1,
    throwOnError: false
  });

  const qGlpiGroups = useQuery({
    queryKey: queryKeys.glpiAssignedGroups,
    queryFn: async () => asArray<GlpiAssignedGroupOption>(await getGlpiAssignedGroupsCatalog()),
    retry: 1,
    throwOnError: false
  });

  const qOrganizations = useQuery({
    queryKey: queryKeys.organizations,
    queryFn: async () => asArray<OrganizationRecord>(await getOrganizations()),
    retry: 1,
    throwOnError: false
  });

  const qContractTypes = useQuery({
    queryKey: queryKeys.contractTypeCatalog,
    queryFn: async () => asArray<ContractTypeCatalogRecord>(await getContractTypeCatalog()),
    retry: 1,
    throwOnError: false
  });

  const qHiringTypes = useQuery({
    queryKey: queryKeys.hiringTypes,
    queryFn: async () => asArray<HiringTypeRecord>(await getHiringTypes()),
    retry: 1,
    throwOnError: false
  });

  const qContractDetail = useQuery({
    queryKey: queryKeys.contractFormData(initialContract?.id ?? ""),
    queryFn: () => getContractFormData(initialContract!.id),
    enabled: Boolean(initialContract?.id),
    retry: 1,
    throwOnError: false,
    placeholderData: initialContract ?? undefined
  });

  useEffect(() => {
    if (qOrganizations.isError) {
      report("orgaos", errorMessage(qOrganizations.error, "Falha ao carregar órgãos"));
    }
  }, [qOrganizations.isError, qOrganizations.error, report]);

  useEffect(() => {
    if (qSuppliers.isError) {
      report("fornecedores", errorMessage(qSuppliers.error, "Falha ao carregar fornecedores"));
    }
  }, [qSuppliers.isError, qSuppliers.error, report]);

  useEffect(() => {
    if (qContractTypes.isError) {
      report("tipos_contrato", errorMessage(qContractTypes.error, "Falha ao carregar tipos de contrato"));
    }
  }, [qContractTypes.isError, qContractTypes.error, report]);

  useEffect(() => {
    if (qHiringTypes.isError) {
      report("tipos_contratacao", errorMessage(qHiringTypes.error, "Falha ao carregar tipos de contratação"));
    }
  }, [qHiringTypes.isError, qHiringTypes.error, report]);

  useEffect(() => {
    if (qFiscais.isError) {
      report("fiscais", errorMessage(qFiscais.error, "Falha ao carregar fiscais"));
    }
  }, [qFiscais.isError, qFiscais.error, report]);

  useEffect(() => {
    if (qGlpiGroups.isError) {
      report("grupos_glpi", errorMessage(qGlpiGroups.error, "Falha ao carregar grupos GLPI"));
    }
  }, [qGlpiGroups.isError, qGlpiGroups.error, report]);

  useEffect(() => {
    if (qContractDetail.isError && initialContract?.id) {
      report("dados_basicos", errorMessage(qContractDetail.error, "Falha ao carregar dados básicos do contrato"));
    }
  }, [qContractDetail.isError, qContractDetail.error, initialContract?.id, report]);

  useEffect(() => {
    if (qPerms.isError) {
      report("permissoes", errorMessage(qPerms.error, "Falha ao carregar permissões"));
    }
  }, [qPerms.isError, qPerms.error, report]);

  const canAdminCatalogs =
    qPerms.data?.role === "ADMIN" ||
    (qPerms.data?.keys ?? []).some(
      (k) => k === "admin.organs.manage" || k === "admin.organs.view" || k.startsWith("admin.")
    );

  const fiscais = useMemo(() => asArray<Fiscal>(qFiscais.data), [qFiscais.data]);
  const suppliers = useMemo(() => asArray<Supplier>(qSuppliers.data), [qSuppliers.data]);
  const organizations = useMemo(() => asArray<OrganizationRecord>(qOrganizations.data), [qOrganizations.data]);
  const contractTypes = useMemo(
    () => asArray<ContractTypeCatalogRecord>(qContractTypes.data),
    [qContractTypes.data]
  );
  const hiringTypes = useMemo(() => asArray<HiringTypeRecord>(qHiringTypes.data), [qHiringTypes.data]);
  const glpiGroups = useMemo(
    () => asArray<GlpiAssignedGroupOption>(qGlpiGroups.data),
    [qGlpiGroups.data]
  );

  const editContract = (qContractDetail.data ?? initialContract) as Contract | null;
  const detailLoadFailed = isEdit && qContractDetail.isError;

  const catalogsLoading =
    qOrganizations.isPending || qContractTypes.isPending || qHiringTypes.isPending;
  const listsLoading = qFiscais.isPending || qSuppliers.isPending || catalogsLoading;

  const dependencyErrors: ContractFormDependencyErrors = useMemo(() => {
    const out: ContractFormDependencyErrors = {};
    if (qOrganizations.isError) out.orgaos = "Não foi possível carregar a lista de órgãos.";
    if (qSuppliers.isError) out.fornecedores = "Não foi possível carregar a lista de fornecedores.";
    if (qContractTypes.isError) out.tipos_contrato = "Não foi possível carregar os tipos de contrato.";
    if (qHiringTypes.isError) out.tipos_contratacao = "Não foi possível carregar os tipos de contratação.";
    if (qFiscais.isError) out.fiscais = "Não foi possível carregar a lista de fiscais.";
    if (qGlpiGroups.isError) out.grupos_glpi = "Não foi possível carregar os grupos GLPI.";
    if (detailLoadFailed) out.dados_basicos = "Não foi possível recarregar o detalhe completo deste contrato.";
    return out;
  }, [
    qOrganizations.isError,
    qSuppliers.isError,
    qContractTypes.isError,
    qHiringTypes.isError,
    qFiscais.isError,
    qGlpiGroups.isError,
    detailLoadFailed
  ]);

  return {
    isEdit,
    action,
    contractId,
    report,
    qPerms,
    qFiscais,
    qSuppliers,
    qGlpiGroups,
    qOrganizations,
    qContractTypes,
    qHiringTypes,
    qContractDetail,
    canAdminCatalogs,
    fiscais,
    suppliers,
    organizations,
    contractTypes,
    hiringTypes,
    glpiGroups,
    editContract,
    detailLoadFailed,
    catalogsLoading,
    listsLoading,
    dependencyErrors
  };
}
