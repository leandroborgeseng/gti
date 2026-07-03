/** Compara códigos hierárquicos (ex.: 12.1.2 vs 12.1.10 vs 12.1.2.1) segmento a segmento. */
export function compareItemCodes(a: string | null | undefined, b: string | null | undefined): number {
  const aCode = a?.trim() ?? "";
  const bCode = b?.trim() ?? "";
  if (!aCode && !bCode) return 0;
  if (!aCode) return 1;
  if (!bCode) return -1;

  const aParts = aCode.split(".");
  const bParts = bCode.split(".");
  const maxLen = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < maxLen; i++) {
    const aPart = aParts[i];
    const bPart = bParts[i];
    if (aPart === undefined) return -1;
    if (bPart === undefined) return 1;
    const cmp = compareItemCodeSegment(aPart, bPart);
    if (cmp !== 0) return cmp;
  }
  return 0;
}

function compareItemCodeSegment(a: string, b: string): number {
  const aNum = /^\d+$/.test(a) ? Number(a) : Number.NaN;
  const bNum = /^\d+$/.test(b) ? Number(b) : Number.NaN;
  if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
    return aNum - bNum;
  }
  return a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });
}

function findParentItemCode(code: string, knownCodes: Iterable<string>): string | null {
  let best: string | null = null;
  for (const raw of knownCodes) {
    const candidate = raw.trim();
    if (!candidate || candidate === code) continue;
    if (code.startsWith(`${candidate}.`)) {
      if (!best || candidate.length > best.length) best = candidate;
    }
  }
  return best;
}

export function itemCodeDepth(code: string | null | undefined, knownCodes: Iterable<string>): number {
  const trimmed = code?.trim();
  if (!trimmed) return 0;
  let depth = 0;
  let current = trimmed;
  while (true) {
    const parent = findParentItemCode(current, knownCodes);
    if (!parent) break;
    depth++;
    current = parent;
  }
  return depth;
}

export type OrderedFeature<T> = { feature: T; depth: number };

/** Ordena funcionalidades pelo código e calcula profundidade para exibição aninhada. */
export function orderFeaturesByItemCode<T extends { itemCode?: string | null; name?: string }>(
  features: T[],
  opts?: { flatDepth?: boolean }
): OrderedFeature<T>[] {
  const sorted = [...features].sort((a, b) => {
    const byCode = compareItemCodes(a.itemCode, b.itemCode);
    if (byCode !== 0) return byCode;
    return (a.name ?? "").localeCompare(b.name ?? "", "pt-BR", { sensitivity: "base" });
  });
  const codes = sorted.map((f) => f.itemCode?.trim() ?? "").filter(Boolean);
  const flatDepth = opts?.flatDepth ?? false;
  return sorted.map((feature) => ({
    feature,
    depth: flatDepth ? 0 : itemCodeDepth(feature.itemCode, codes)
  }));
}
