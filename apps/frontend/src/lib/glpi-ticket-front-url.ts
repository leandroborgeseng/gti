/**
 * Monta URL pública do formulário do chamado no GLPI (UI), a partir da base
 * `NEXT_PUBLIC_GLPI_BASE_URL` (ex.: `https://host/api.php` → `https://host/front/ticket.form.php?id=N`).
 * Retorna null quando a base pública não está configurada ou é o stub de build.
 */
export function buildGlpiTicketFrontUrl(glpiTicketId: number): string | null {
  if (!Number.isFinite(glpiTicketId) || glpiTicketId <= 0) return null;
  const raw = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_GLPI_BASE_URL?.trim() : "";
  if (!raw || raw.includes("build.invalid")) return null;
  try {
    const api = new URL(raw.includes("://") ? raw : `https://${raw}`);
    let path = api.pathname.replace(/\/+$/, "");
    if (/\/api\.php$/i.test(path) || /\/apirest\.php$/i.test(path)) {
      path = path.replace(/\/(api|apirest)\.php$/i, "");
    }
    const base = `${api.origin}${path}`;
    return `${base.replace(/\/+$/, "")}/front/ticket.form.php?id=${Math.trunc(glpiTicketId)}`;
  } catch {
    return null;
  }
}
