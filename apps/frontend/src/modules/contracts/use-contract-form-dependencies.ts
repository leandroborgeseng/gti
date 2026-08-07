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
import {
  CONTRACT_FORM_CATALOG_STALE_MS,
  CONTRACT_FORM_HEAVY_STALE_MS
} from "@/modules/contracts/prefetch-contract-form-catalogs";

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
    staleTime: CONTRACT_FORM_CATALOG_STALE_MS,
    retry: 1,
    throwOnError: false
  });

  const qSuppliers = useQuery({
    queryKey: queryKeys.suppliers,
    queryFn: async () => asArray<Supplier>(await getSuppliers()),
    staleTime: CONTRACT_FORM_CATALOG_STALE_MS,
    retry: 1,
    throwOnError: false
  });

  const qGlpiGroups = useQuery({
    queryKey: queryKeys.glpiAssignedGroups,
    queryFn: async () => asArray<GlpiAssignedGroupOption>(await getGlpiAssignedGroupsCatalog()),
    staleTime: CONTRACT_FORM_HEAVY_STALE_MS,
    retry: 1,
    throwOnError: false
  });

  const qOrganizations = useQuery({
    queryKey: queryKeys.organizations,
    queryFn: async () => asArray<OrganizationRecord>(await getOrganizations()),
    staleTime: CONTRACT_FORM_CATALOG_STALE_MS,
    retry: 1,
    throwOnError: false
  });

  const qContractTypes = useQuery({
    queryKey: queryKeys.contractTypeCatalog,
    queryFn: async () => asArray<ContractTypeCatalogRecord>(await getContractTypeCatalog()),
    staleTime: CONTRACT_FORM_CATALOG_STALE_MS,
    retry: 1,
    throwOnError: false
  });

  const qHiringTypes = useQuery({
    queryKey: queryKeys.hiringTypes,
    queryFn: async () => asArray<HiringTypeRecord>(await getHiringTypes()),
    staleTime: CONTRACT_FORM_CATALOG_STALE_MS,
    retry: 1,
    throwOnError: false
  });

  const qContractDetail = useQuery({
    queryKey: queryKeys.contractFormData(initialContract?.id ?? ""),
    queryFn: () => getContractFormData(initialContract!.id),
    enabled: Boolean(initialContract?.id),
    staleTime: 30_000,
    retry: 1,
    throwOnError: false,
    placeholderData: initialContract ?? undefined
  });

  // Um único efeito de diagnóstico — evita 8 efeitos reagindo em cascata.
  useEffect(() => {
    const failures: Array<[ContractFormLoadStage, unknown, string]> = [
      [ "orgaos", qOrganizations.isError ? qOrganizations.error : null, "Falha ao carregar órgãos" ],
      [ "fornecedores", qSuppliers.isError ? qSuppliers.error : null, "Falha ao carregar fornecedores" ],
      [ "tipos_contrato", qContractTypes.isError ? qContractTypes.error : null, "Falha ao carregar tipos de contrato" ],
      [ "tipos_contratacao", qHiringTypes.isError ? qHiringTypes.error : null, "Falha ao carregar tipos de contratação" ],
      [ "fiscais", qFiscais.isError ? qFiscais.error : null, "Falha ao carregar fiscais" ],
      [ "grupos_glpi", qGlpiGroups.isError ? qGlpiGroups.error : null, "Falha ao carregar grupos GLPI" ],
      [ "permissoes", qPerms.isError ? qPerms.error : null, "Falha ao carregar permissões" ]
    ];
    for (const [stage, err, fallback] of failures) {
      if (err) report(stage, errorMessage(err, fallback));
    }
    if (qContractDetail.isError && initialContract?.id) {
      report(
        "dados_basicos",
        errorMessage(qContractDetail.error, "Falha ao carregar dados básicos do contrato")
      );
    }
  }, [
    qOrganizations.isError,
    qOrganizations.error,
    qSuppliers.isError,
    qSuppliers.error,
    qContractTypes.isError,
    qContractTypes.error,
    qHiringTypes.isError,
    qHiringTypes.error,
    qFiscais.isError,
    qFiscais.error,
    qGlpiGroups.isError,
    qGlpiGroups.error,
    qPerms.isError,
    qPerms.error,
    qContractDetail.isError,
    qContractDetail.error,
    initialContract?.id,
    report
  ]);

  const canAdminCatalogs =
    qPerms.data?.role === "ADMIN" ||
    (qPerms.data?.keys ?? []).some(
      (k) => k === "admin.organs.manage" || k === "admin.organs.view" || k.startsWith("admin.")
    );

  // queryFn já normaliza com asArray — evita remapeamento a cada render.
  const fiscais = qFiscais.data ?? [];
  const suppliers = qSuppliers.data ?? [];
  const organizations = qOrganizations.data ?? [];
  const contractTypes = qContractTypes.data ?? [];
  const hiringTypes = qHiringTypes.data ?? [];
  const glpiGroups = qGlpiGroups.data ?? [];

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
