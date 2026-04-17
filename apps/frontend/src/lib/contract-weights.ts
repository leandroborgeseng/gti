/** Meta de soma de pesos (módulos do contrato ou funcionalidades por módulo). */
export const CONTRACT_WEIGHT_SUM_TARGET = 1;

/** Tolerância numérica (somas gravadas em `Decimal(8,4)`). */
export const CONTRACT_WEIGHT_TOLERANCE = 0.002;

export function parseContractWeight(input: string): number {
  const n = Number(String(input).trim().replace(",", "."));
  if (!Number.isFinite(n) || n < 0) {
    return NaN;
  }
  return n;
}

export function weightSumMatchesTarget(sum: number): boolean {
  return Math.abs(sum - CONTRACT_WEIGHT_SUM_TARGET) <= CONTRACT_WEIGHT_TOLERANCE;
}

export function formatWeightPt(value: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

export function sumParsedWeights(weights: number[]): number {
  return weights.reduce((a, b) => a + b, 0);
}

/** Soma dos pesos das funcionalidades do módulo; `replace` simula o valor após gravar uma linha. */
export function projectModuleFeaturesSum(
  features: ReadonlyArray<{ id: string; weight: string | number }>,
  replace?: { id: string; weight: number }
): number {
  let s = 0;
  for (const x of features) {
    const w = replace?.id === x.id ? replace.weight : Number(x.weight);
    if (!Number.isFinite(w)) continue;
    s += w;
  }
  return s;
}

/** Soma dos pesos dos módulos; `replace` simula o valor de um módulo após gravar. */
export function projectContractModulesSum(
  modules: ReadonlyArray<{ id: string; weight: string | number }>,
  replace?: { id: string; weight: number }
): number {
  let s = 0;
  for (const m of modules) {
    const w = replace?.id === m.id ? replace.weight : Number(m.weight);
    if (!Number.isFinite(w)) continue;
    s += w;
  }
  return s;
}

export function confirmWeightSumDeviation(projectedSum: number, contextLabel: string): boolean {
  if (weightSumMatchesTarget(projectedSum)) {
    return true;
  }
  if (typeof window === "undefined") {
    return true;
  }
  const msg = `${contextLabel}\n\nA soma dos pesos ficará ${formatWeightPt(projectedSum)} (meta ${CONTRACT_WEIGHT_SUM_TARGET}).\n\nDeseja continuar mesmo assim?`;
  return window.confirm(msg);
}
