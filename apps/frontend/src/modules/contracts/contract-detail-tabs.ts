export const CONTRACT_DETAIL_TABS = [
  {
    id: "dados",
    label: "Dados do contrato",
    shortLabel: "Dados",
    /** Qualquer permissão listada concede a aba; vazio = sempre (com contracts.view da página). */
    anyOf: [] as string[]
  },
  {
    id: "arquivos",
    label: "Arquivos",
    shortLabel: "Arquivos",
    anyOf: ["contracts.view"]
  },
  {
    id: "consumos",
    label: "Consumos",
    shortLabel: "Consumos",
    anyOf: ["contracts.financial.view", "contracts.view", "measurements.view"]
  },
  {
    id: "chamados-glpi",
    label: "Chamados GLPI",
    shortLabel: "GLPI",
    anyOf: ["contracts.view"]
  },
  {
    id: "cronogramas",
    label: "Cronogramas",
    shortLabel: "Cronogramas",
    anyOf: ["schedules.view", "contracts.view"]
  },
  {
    id: "notificacoes",
    label: "Notificações",
    shortLabel: "Notificações",
    anyOf: ["notifications.view"]
  },
  {
    id: "grupos-validacao",
    label: "Grupos de Validação",
    shortLabel: "Validação",
    anyOf: ["contracts.view", "contracts.features.view", "contracts.edit"]
  },
  {
    id: "modulos",
    label: "Módulos e funcionalidades",
    shortLabel: "Módulos",
    anyOf: ["contracts.features.view"]
  },
  {
    id: "auditoria",
    label: "Auditoria",
    shortLabel: "Auditoria",
    anyOf: ["contracts.view", "contracts.features.view"]
  }
] as const;

export type ContractDetailTabId = (typeof CONTRACT_DETAIL_TABS)[number]["id"];

export const DEFAULT_CONTRACT_DETAIL_TAB: ContractDetailTabId = "dados";

export function isContractDetailTabId(value: string | null | undefined): value is ContractDetailTabId {
  return CONTRACT_DETAIL_TABS.some((t) => t.id === value);
}

export function tabAllowed(
  tab: (typeof CONTRACT_DETAIL_TABS)[number],
  permissionKeys: readonly string[] | null | undefined
): boolean {
  if (tab.anyOf.length === 0) return true;
  // Enquanto permissões carregam, mantém abas/visibilidade otimista para respeitar deep links.
  if (permissionKeys == null) return true;
  return tab.anyOf.some((key) => permissionKeys.includes(key));
}

export function resolveContractDetailTab(
  raw: string | null | undefined,
  permissionKeys: readonly string[] | null | undefined
): ContractDetailTabId {
  if (permissionKeys == null) {
    return isContractDetailTabId(raw) ? raw : DEFAULT_CONTRACT_DETAIL_TAB;
  }
  const allowed = CONTRACT_DETAIL_TABS.filter((t) => tabAllowed(t, permissionKeys));
  if (isContractDetailTabId(raw) && allowed.some((t) => t.id === raw)) {
    return raw;
  }
  return allowed[0]?.id ?? DEFAULT_CONTRACT_DETAIL_TAB;
}
