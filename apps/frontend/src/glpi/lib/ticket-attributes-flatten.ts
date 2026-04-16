export interface TicketAttributeInput {
  keyPath: string;
  valueType: string;
  valueText: string | null;
  valueJson: string | null;
}

function toJsonString(value: unknown): string {
  return JSON.stringify(value);
}

export function flattenAttributes(value: unknown, path = "", output: TicketAttributeInput[] = []): TicketAttributeInput[] {
  if (value === null || value === undefined) {
    output.push({
      keyPath: path || "$",
      valueType: "null",
      valueText: null,
      valueJson: null
    });
    return output;
  }

  if (Array.isArray(value)) {
    output.push({
      keyPath: path || "$",
      valueType: "array",
      valueText: null,
      valueJson: toJsonString(value)
    });
    value.forEach((item, index) => {
      flattenAttributes(item, path ? `${path}[${index}]` : `[${index}]`, output);
    });
    return output;
  }

  if (typeof value === "object") {
    output.push({
      keyPath: path || "$",
      valueType: "object",
      valueText: null,
      valueJson: toJsonString(value)
    });
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const nestedPath = path ? `${path}.${key}` : key;
      flattenAttributes(nested, nestedPath, output);
    }
    return output;
  }

  output.push({
    keyPath: path || "$",
    valueType: typeof value,
    valueText: String(value),
    valueJson: null
  });
  return output;
}
