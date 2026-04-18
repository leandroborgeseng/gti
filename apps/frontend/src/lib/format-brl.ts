/** Formata valores monetários vindos da API (string decimal, número ou desconhecido). */
export function formatBrl(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return "—";
    }
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  const s = String(value).trim().replace(/\s/g, "").replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n)) {
    return "—";
  }
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatPercent(value: unknown, fractionDigits = 2): string {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(n)) {
    return "—";
  }
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: fractionDigits, minimumFractionDigits: 0 })}%`;
}
