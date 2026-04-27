import { AsyncLocalStorage } from "node:async_hooks";

/** Contexto do pedido HTTP autenticado (preenchido pelo interceptor após o JWT). */
export type RequestActor = { userId: string; email?: string; role: string };

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
