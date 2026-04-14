type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return {};
}

export function extractGlpiScalarId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  const obj = asObject(value);
  const id = obj.id;
  if (typeof id === "number" && Number.isFinite(id)) {
    return id;
  }
  if (typeof id === "string" && Number.isFinite(Number(id))) {
    return Number(id);
  }
  return null;
}

export function extractGlpiStringLabel(value: unknown): string | null {
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }
  const obj = asObject(value);
  const name = obj.name ?? obj.label ?? obj.title;
  if (typeof name === "string" && name.trim() !== "") {
    return name;
  }
  return null;
}
