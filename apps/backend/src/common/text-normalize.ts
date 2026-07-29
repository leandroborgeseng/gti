/** Normaliza texto para comparação de unicidade (minúsculas, espaços colapsados). */
export function normalizeCatalogName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

/** Normaliza sigla para comparação de unicidade (minúsculas, sem espaços). */
export function normalizeCatalogAcronym(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, "");
}

/** Mantém apenas letras e números na sigla (maiúsculas). */
export function sanitizeAcronymUpper(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}
