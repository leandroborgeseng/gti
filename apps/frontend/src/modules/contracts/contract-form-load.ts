/**
 * Etapas e utilitários do carregamento do formulário de contrato (ticket 74).
 * Isola falhas por dependência e normaliza respostas inconsistentes da API.
 */

export const CONTRACT_FORM_LOAD_STAGES = [
  "dados_basicos",
  "orgaos",
  "fornecedores",
  "tipos_contrato",
  "tipos_contratacao",
  "fiscais",
  "grupos_glpi",
  "itens_contratuais",
  "catalogo_precos",
  "permissoes",
  "form_reset",
  "pricing_items_map",
  "error_boundary",
  "render_section"
] as const;

export type ContractFormLoadStage = (typeof CONTRACT_FORM_LOAD_STAGES)[number];

export type ContractFormLoadDiag = {
  stage: ContractFormLoadStage;
  ok: boolean;
  message?: string;
  at: string;
};

/** Extrai lista de respostas heterogêneas (array, {data}, {items}, nulo). */
export function asArray<T = unknown>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload == null) return [];
  if (typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  if (Array.isArray(obj.data)) return obj.data as T[];
  if (Array.isArray(obj.items)) return obj.items as T[];
  if (Array.isArray(obj.results)) return obj.results as T[];
  if (Array.isArray(obj.rows)) return obj.rows as T[];
  return [];
}

/** Garante valor utilizável em SelectItem (Radix rejeita string vazia). */
export function safeOptionId(id: unknown): string | null {
  if (typeof id !== "string") return null;
  const v = id.trim();
  return v.length > 0 ? v : null;
}

export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  if (typeof err === "string" && err.trim()) return err.trim();
  return fallback;
}

/** Log técnico local (dev + console). Não expor ao usuário final. */
export function logContractFormStage(
  action: "create" | "edit",
  contractId: string | null | undefined,
  stage: ContractFormLoadStage,
  message: string
): void {
  const payload = {
    screen: "contract-form",
    action,
    contractId: contractId ?? null,
    stage,
    message,
    at: new Date().toISOString()
  };
  if (process.env.NODE_ENV !== "production") {
    console.warn("[contract-form-load]", payload);
  } else {
    console.error("[contract-form-load]", payload);
  }
}
