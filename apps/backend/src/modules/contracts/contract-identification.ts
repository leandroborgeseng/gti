/** Parsing e regras da identificação contratual (código interno vs número formal). */

export type ParsedInternalCode = {
  acronym: string;
  year: number;
  sequential: number;
  raw: string;
};

const INTERNAL_CODE_RE = /^([A-Za-z]{1,16})-(\d{4})-(\d{1,8})$/;

export function parseInternalCode(value: string | null | undefined): ParsedInternalCode | null {
  const raw = (value ?? "").trim();
  const match = INTERNAL_CODE_RE.exec(raw);
  if (!match) return null;
  const year = Number(match[2]);
  const sequential = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(sequential)) return null;
  return {
    acronym: match[1].toUpperCase(),
    year,
    sequential,
    raw
  };
}

export function digitsOnly(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/** Formal gerado erroneamente a partir dos dígitos de um código interno. */
export function isFormalDerivedFromInternal(
  formalNumber: string | null | undefined,
  internalLike: string | null | undefined
): boolean {
  const formal = digitsOnly(formalNumber);
  const fromInternal = digitsOnly(internalLike);
  return Boolean(formal && fromInternal && formal === fromInternal && parseInternalCode(internalLike));
}

export type IdentificationIssue =
  | "MISSING_FORMAL_NUMBER"
  | "MISSING_CONTRACT_TYPE"
  | "MISSING_ADMIN_PROCESS"
  | "MISSING_HIRING_TYPE"
  | "MISSING_START_DATE"
  | "YEAR_MISMATCH"
  | "ORGANIZATION_PENDING"
  | "MISSING_INTERNAL_CODE";

export function collectIdentificationIssues(input: {
  formalNumber?: string | null;
  contractTypeCatalogId?: string | null;
  administrativeProcess?: string | null;
  hiringTypeId?: string | null;
  startDate?: Date | string | null;
  contractYear?: number | null;
  internalCode?: string | null;
  organizationPending?: boolean | null;
}): IdentificationIssue[] {
  const issues: IdentificationIssue[] = [];
  if (!input.formalNumber?.trim()) issues.push("MISSING_FORMAL_NUMBER");
  if (!input.contractTypeCatalogId) issues.push("MISSING_CONTRACT_TYPE");
  if (!input.administrativeProcess?.trim()) issues.push("MISSING_ADMIN_PROCESS");
  if (!input.hiringTypeId) issues.push("MISSING_HIRING_TYPE");
  if (!input.startDate) {
    issues.push("MISSING_START_DATE");
  } else {
    const start = input.startDate instanceof Date ? input.startDate : new Date(input.startDate);
    if (!Number.isNaN(start.getTime())) {
      const startYearUtc = start.getUTCFullYear();
      const startYearLocal = start.getFullYear();
      const matchesStartYear = (year: number) => year === startYearUtc || year === startYearLocal;
      const parsed = parseInternalCode(input.internalCode);
      if (parsed && !matchesStartYear(parsed.year)) {
        issues.push("YEAR_MISMATCH");
      } else if (input.contractYear != null && !matchesStartYear(input.contractYear)) {
        issues.push("YEAR_MISMATCH");
      }
    }
  }
  if (input.organizationPending) issues.push("ORGANIZATION_PENDING");
  if (!input.internalCode?.trim()) issues.push("MISSING_INTERNAL_CODE");
  return issues;
}
