export type ContractLifecycleStatus = "ACTIVE" | "EXPIRED" | "SUSPENDED";

export const CONTRACT_STATUS_OPTIONS: Array<{ value: ContractLifecycleStatus; label: string }> = [
  { value: "ACTIVE", label: "Ativo" },
  { value: "SUSPENDED", label: "Suspenso" },
  { value: "EXPIRED", label: "Encerrado" }
];

export function contractStatusLabel(value: string | null | undefined): string {
  if (!value) return "-";
  return CONTRACT_STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function isContractLifecycleStatus(value: string | null | undefined): value is ContractLifecycleStatus {
  return value === "ACTIVE" || value === "EXPIRED" || value === "SUSPENDED";
}

export function contractStatusConfirmationCopy(
  previous: string,
  next: ContractLifecycleStatus
): { title: string; description: string } {
  const prevLeg = contractStatusLabel(previous);
  if (next === "EXPIRED") {
    return {
      title: "Encerrar contrato?",
      description: `Isto indica encerramento administrativo ou fim de vigência tratado como concluído. Estado atual: ${prevLeg}.`
    };
  }
  if (next === "SUSPENDED") {
    return {
      title: "Suspender contrato?",
      description: `Enquanto estiver suspenso, não será possível registrar novos aditivos neste fluxo. Estado atual: ${prevLeg}.`
    };
  }
  return {
    title: "Reativar contrato?",
    description: `O contrato passará a «Ativo» e voltará a permitir aditivos e demais operações conforme as regras do sistema. Estado atual: ${prevLeg}.`
  };
}
