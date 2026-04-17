import { asJsonRecord } from "../ticket-json";

function str(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return null;
}

function toLabel(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    const lbl = o.label ?? o.name ?? o.title ?? o.completename;
    if (typeof lbl === "string" && lbl.trim()) {
      return lbl.trim();
    }
  }
  return null;
}

/** Campos do painel direito GLPI (rótulos quando existirem no JSON). */
export function extractTicketSidebarFields(rawUnknown: unknown): {
  typeLabel: string | null;
  requestOriginLabel: string | null;
  urgencyLabel: string | null;
  impactLabel: string | null;
  locationLabel: string | null;
  tagsLabel: string | null;
} {
  const raw = asJsonRecord(rawUnknown);
  return {
    typeLabel:
      toLabel(raw.type) ??
      str(raw.type_name) ??
      (typeof raw.type === "number"
        ? raw.type === 1
          ? "Incidente"
          : raw.type === 2
            ? "Requisição"
            : null
        : null),
    requestOriginLabel:
      toLabel(raw.requesttypes_id) ??
      str(raw.requesttypes_id_name) ??
      str(raw.request_type_name) ??
      toLabel(raw.requesttype),
    urgencyLabel: toLabel(raw.urgency) ?? str(raw.urgency_name),
    impactLabel: toLabel(raw.impact) ?? str(raw.impact_name),
    locationLabel:
      toLabel(raw.locations_id) ??
      str(raw.locations_id_name) ??
      str(raw.location_name) ??
      toLabel(raw.location),
    tagsLabel:
      str(raw.tag) ??
      (Array.isArray(raw.tags)
        ? raw.tags
            .map((t) => {
              if (typeof t === "string") {
                return str(t);
              }
              const o = asJsonRecord(t);
              return str(o.name ?? o.label ?? o.title);
            })
            .filter((x): x is string => Boolean(x))
            .join(", ")
        : null)
  };
}
