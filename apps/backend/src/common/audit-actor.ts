import { AsyncLocalStorage } from "node:async_hooks";

/** Contexto do pedido HTTP autenticado (preenchido pelo interceptor / gestao-dispatch). */
export type RequestActor = {
  userId: string;
  email?: string;
  /** systemKey do perfil ativo (ADMIN|EDITOR|VIEWER) ou role legado. */
  role: string;
  profileId?: string | null;
  /** Órgão ativo; null quando «Todos os órgãos». */
  organizationId?: string | null;
  /** true quando o contexto ativo é visão global de órgãos. */
  allOrganizationsActive?: boolean;
};

export const requestActorStore = new AsyncLocalStorage<RequestActor>();

/** Identificador salvo em `AuditLog.userId` (UUID do usuário). */
export function getAuditActorId(): string {
  const id = requestActorStore.getStore()?.userId;
  if (!id || id === "anonymous") {
    return "system";
  }
  return id;
}

/** Rótulo legível para campos como `Glosa.createdBy` (e-mail quando existir). */
export function getAuditActorLabel(): string {
  const s = requestActorStore.getStore();
  if (!s || s.userId === "anonymous") {
    return "system";
  }
  return s.email?.trim() || s.userId;
}
