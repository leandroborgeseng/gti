import { ForbiddenException } from "@nestjs/common";
import type { Prisma, PrismaClient, UserKind } from "@prisma/client";
import { requestActorStore, type RequestActor } from "./audit-actor";

export const EXTERNAL_PROFILE_ID = "00000000-0000-4000-8000-0000000000x4";

export function isExternalActor(actor?: RequestActor | null): boolean {
  return actor?.userKind === "EXTERNAL" || actor?.role === "EXTERNAL";
}

/** IDs de contratos autorizados ao ator externo (vazio se interno). */
export function actorAuthorizedContractIds(actor?: RequestActor | null): string[] | null {
  if (!isExternalActor(actor)) return null;
  return actor?.authorizedContractIds ?? [];
}

export function assertExternalCanAccessContract(contractId: string, actor?: RequestActor | null): void {
  const a = actor ?? requestActorStore.getStore();
  if (!isExternalActor(a)) return;
  const ids = a?.authorizedContractIds ?? [];
  if (!ids.includes(contractId)) {
    throw new ForbiddenException("Você não tem acesso a este contrato.");
  }
}

/** Filtro Prisma para listagens de contratos (externo = só autorizados). */
export function externalContractScope(
  actor?: RequestActor | null
): Prisma.ContractWhereInput | null {
  const a = actor ?? requestActorStore.getStore();
  if (!isExternalActor(a)) return null;
  const ids = a?.authorizedContractIds ?? [];
  return { id: { in: ids } };
}

export async function loadExternalContractIds(
  prisma: PrismaClient,
  userId: string
): Promise<string[]> {
  const rows = await prisma.userExternalContract.findMany({
    where: { userId },
    select: { contractId: true }
  });
  return rows.map((r) => r.contractId);
}

export async function loadUserKind(
  prisma: PrismaClient,
  userId: string
): Promise<{ userKind: UserKind; supplierId: string | null }> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { userKind: true, supplierId: true }
  });
  return { userKind: u?.userKind ?? "INTERNAL", supplierId: u?.supplierId ?? null };
}
