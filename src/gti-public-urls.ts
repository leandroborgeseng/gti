/**
 * URLs públicas para integrar o servidor GLPI (Node) com a app Next num único domínio.
 * Defina no processo do Node: GTI_NEXT_PUBLIC_URL, GTI_GLPI_UI_BASE (opcional mas recomendado em produção).
 */

export const GTI_DELEGABLE_TO_NEXT = new Set([
  "/contracts",
  "/measurements",
  "/glosas",
  "/suppliers",
  "/fiscais",
  "/reports",
  "/governance/tickets",
  "/goals"
]);

function trimSlashEnd(s: string): string {
  return s.replace(/\/+$/, "");
}

/** URL pública da app Next (ex.: https://gti.up.railway.app). Aceita também o nome legado GTI_NEXT_APP_URL. */
export function gtiNextPublicBase(): string {
  const a = (process.env.GTI_NEXT_PUBLIC_URL || "").trim();
  const b = (process.env.GTI_NEXT_APP_URL || "").trim();
  return trimSlashEnd(a || b);
}

/**
 * URL base onde o Kanban é servido no browser (ex.: https://gti.up.railway.app/operacao/glpi).
 * Se não definir GTI_GLPI_UI_BASE mas existir GTI_NEXT_PUBLIC_URL, assume o prefixo fixo
 * `/operacao/glpi` na mesma app Next (proxy integrado).
 */
export function gtiGlpiUiBase(): string {
  const explicit = trimSlashEnd((process.env.GTI_GLPI_UI_BASE || "").trim());
  if (explicit) return explicit;
  const next = gtiNextPublicBase();
  if (next) return `${next}/operacao/glpi`;
  return "";
}

/** Destino absoluto para rotas de gestão contratual na app Next. */
export function gtiHrefDelegable(path: string): string {
  const base = gtiNextPublicBase();
  if (!base || !GTI_DELEGABLE_TO_NEXT.has(path)) return path;
  return `${base}${path}`;
}

/** Destino do Kanban no browser (com prefixo de proxy) ou /dashboard em desenvolvimento só-Node. */
export function gtiHrefGlpiPage(_path: "/dashboard" | "/"): string {
  const mount = gtiGlpiUiBase();
  if (mount) return `${mount}/dashboard`;
  return "/dashboard";
}

/** Atributo action do formulário de filtros do Kanban (submissão no browser). */
export function gtiKanbanFiltersAction(pathname: string): string {
  const mount = gtiGlpiUiBase();
  const logical = pathname === "/" ? "/dashboard" : pathname;
  if (mount && (logical === "/dashboard" || pathname === "/")) {
    return `${mount}/dashboard`;
  }
  return logical;
}
