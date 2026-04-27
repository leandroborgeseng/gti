/**
 * Remove aspas envolventes que às vezes ficam salvas no valor (copiar/colar ou UI).
 * Ex.: `"https://exemplo.gov.br/api.php"` → `https://exemplo.gov.br/api.php`
 */
export function normalizeEnvValue(raw: string | undefined): string | undefined {
  if (raw == null) {
    return undefined;
  }
  let v = raw.trim();
  while (v.length >= 2) {
    const a = v[0];
    const b = v[v.length - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) {
      v = v.slice(1, -1).trim();
      continue;
    }
    break;
  }
  return v.length > 0 ? v : undefined;
}

/** Valor parece referência Railway `${{Servico.VAR}}` ainda não resolvida (ou colado como texto). */
export function looksLikeRailwayTemplateLiteral(value: string | undefined): boolean {
  const v = normalizeEnvValue(value);
  return Boolean(v?.includes("${{") && v.includes("}}"));
}
