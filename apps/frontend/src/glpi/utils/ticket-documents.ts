import { asJsonRecord } from "../ticket-json";
import { resolveGlpiAssetUrl } from "../glpi-asset-url";

export type TicketDocumentDto = {
  id: string;
  filename: string;
  /** URL absoluta no host GLPI (para usar com `/api/glpi-asset`). */
  glpiUrl: string;
};

function str(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return null;
}

function pickUrlFromRow(o: Record<string, unknown>): string | null {
  return (
    str(o.downloadHref) ??
    str(o.download_href) ??
    str(o.download) ??
    str(o.download_url) ??
    str(o.downloadUrl) ??
    str(o.href) ??
    str(o.link) ??
    str(o.url) ??
    str(o.path)
  );
}

function pickFilename(o: Record<string, unknown>): string {
  return str(o.filename) ?? str(o.name) ?? str(o.label) ?? str(o.title) ?? "Anexo";
}

function pickId(o: Record<string, unknown>): string {
  return str(o.id) ?? str(o.documents_id) ?? str(o.document_id) ?? str(o.items_id) ?? "doc";
}

function pushFromArray(rows: unknown, out: TicketDocumentDto[], seen: Set<string>): void {
  if (!Array.isArray(rows)) {
    return;
  }
  for (const row of rows) {
    const o = asJsonRecord(row);
    const href = pickUrlFromRow(o);
    if (!href) {
      continue;
    }
    const resolved = resolveGlpiAssetUrl(href);
    if (!resolved) {
      continue;
    }
    if (seen.has(resolved)) {
      continue;
    }
    seen.add(resolved);
    out.push({
      id: pickId(o),
      filename: pickFilename(o),
      glpiUrl: resolved
    });
  }
}

function tryHalLinks(raw: Record<string, unknown>, out: TicketDocumentDto[], seen: Set<string>): void {
  const links = raw._links;
  if (!links || typeof links !== "object" || Array.isArray(links)) {
    return;
  }
  const L = links as Record<string, unknown>;
  for (const key of ["documents", "document", "Document"]) {
    const block = L[key];
    if (Array.isArray(block)) {
      pushFromArray(block, out, seen);
    } else if (block && typeof block === "object") {
      const o = asJsonRecord(block);
      const href = pickUrlFromRow(o);
      if (href) {
        const resolved = resolveGlpiAssetUrl(href);
        if (resolved && !seen.has(resolved)) {
          seen.add(resolved);
          out.push({ id: pickId(o), filename: pickFilename(o), glpiUrl: resolved });
        }
      }
    }
  }
}

/**
 * Documentos / anexos referenciados no JSON do chamado GLPI (várias formas da API v2 / HAL).
 */
export function extractTicketDocumentsFromRaw(rawUnknown: unknown): TicketDocumentDto[] {
  const raw = asJsonRecord(rawUnknown);
  const out: TicketDocumentDto[] = [];
  const seen = new Set<string>();

  for (const key of [
    "_documents",
    "documents",
    "document",
    "document_items",
    "documentitems",
    "Document_Item",
    "DocumentItem",
    "ticket_documents"
  ]) {
    const v = raw[key];
    pushFromArray(v, out, seen);
  }

  tryHalLinks(raw, out, seen);
  return out;
}
