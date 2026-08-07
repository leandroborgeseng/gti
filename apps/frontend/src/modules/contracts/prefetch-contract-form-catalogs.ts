import type { QueryClient } from "@tanstack/react-query";
import {
  getContractPricingCatalog,
  getContractTypeCatalog,
  getFiscais,
  getGlpiAssignedGroupsCatalog,
  getHiringTypes,
  getOrganizations,
  getSuppliers,
  type ContractTypeCatalogRecord,
  type Fiscal,
  type GlpiAssignedGroupOption,
  type HiringTypeRecord,
  type OrganizationRecord,
  type Supplier
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { asArray } from "@/modules/contracts/contract-form-load";

/** Catálogos administrativos mudam pouco — cache mais longo reduz latência ao abrir o formulário. */
export const CONTRACT_FORM_CATALOG_STALE_MS = 5 * 60_000;
/** Grupos GLPI e precificação: cache um pouco maior (chamadas mais caras). */
export const CONTRACT_FORM_HEAVY_STALE_MS = 10 * 60_000;

/**
 * Prefetch em background dos catálogos usados pelo formulário de contrato.
 * Chamado na listagem para que «Novo/Editar» abra com dados já em cache.
 */
export function prefetchContractFormCatalogs(qc: QueryClient): void {
  void qc.prefetchQuery({
    queryKey: queryKeys.organizations,
    queryFn: async () => asArray<OrganizationRecord>(await getOrganizations()),
    staleTime: CONTRACT_FORM_CATALOG_STALE_MS
  });
  void qc.prefetchQuery({
    queryKey: queryKeys.contractTypeCatalog,
    queryFn: async () => asArray<ContractTypeCatalogRecord>(await getContractTypeCatalog()),
    staleTime: CONTRACT_FORM_CATALOG_STALE_MS
  });
  void qc.prefetchQuery({
    queryKey: queryKeys.hiringTypes,
    queryFn: async () => asArray<HiringTypeRecord>(await getHiringTypes()),
    staleTime: CONTRACT_FORM_CATALOG_STALE_MS
  });
  void qc.prefetchQuery({
    queryKey: queryKeys.fiscais,
    queryFn: async () => asArray<Fiscal>(await getFiscais()),
    staleTime: CONTRACT_FORM_CATALOG_STALE_MS
  });
  void qc.prefetchQuery({
    queryKey: queryKeys.suppliers,
    queryFn: async () => asArray<Supplier>(await getSuppliers()),
    staleTime: CONTRACT_FORM_CATALOG_STALE_MS
  });
  void qc.prefetchQuery({
    queryKey: queryKeys.glpiAssignedGroups,
    queryFn: async () => asArray<GlpiAssignedGroupOption>(await getGlpiAssignedGroupsCatalog()),
    staleTime: CONTRACT_FORM_HEAVY_STALE_MS
  });
  void qc.prefetchQuery({
    queryKey: queryKeys.contractPricingCatalog,
    queryFn: getContractPricingCatalog,
    staleTime: CONTRACT_FORM_HEAVY_STALE_MS
  });
}
