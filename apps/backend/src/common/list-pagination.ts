/** Tamanhos de página das listagens paginadas (medições, glosas, documentos, auditoria). */
export const LIST_PAGE_SIZES = [10, 25, 50, 100] as const;

export function parseListPagination(query?: { page?: number | string; pageSize?: number | string }): {
  page: number;
  pageSize: number;
  skip: number;
} {
  const allowed = new Set<number>(LIST_PAGE_SIZES);
  const pageSizeRaw = Number(query?.pageSize ?? 25);
  const pageSize = allowed.has(pageSizeRaw) ? pageSizeRaw : 25;
  const page = Math.max(1, Number(query?.page ?? 1) || 1);
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export function listPageResult<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number
): { items: T[]; total: number; page: number; pageSize: number; pageCount: number } {
  const pageCount = total === 0 ? 0 : Math.ceil(total / pageSize);
  return { items, total, page, pageSize, pageCount };
}
