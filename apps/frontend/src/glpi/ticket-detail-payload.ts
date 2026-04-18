import type { InputJsonValue } from "@prisma/client/runtime/library";
import { prisma } from "./config/prisma";
import { logger } from "./config/logger";
import { fetchGlpiTicketJson } from "./services/glpi-ticket-write.service";
import { enrichObserverRows, fetchCachedGlpiUserContact } from "./services/glpi-user.service";
import { loadAndPersistWaitingParty } from "./services/glpi-ticket-history.service";
import { extractGlpiScalarId } from "./utils/glpi-field-parse";
import { extractObserversFromTicketRaw } from "./utils/ticket-observers";
import { extractRequesterContact } from "./utils/ticket-requester";
import { asJsonRecord, extractTicketContext, PRIORITY_OPTIONS, STATUS_OPTIONS } from "./ticket-json";
import { extractTicketDocumentsFromRaw } from "./utils/ticket-documents";
import { extractTicketSidebarFields } from "./utils/ticket-sidebar-fields";
import { toErrorLog } from "./errors";

export async function buildTicketDetailPayload(glpiId: number): Promise<Record<string, unknown> | null> {
  const ticket = await prisma.ticket.findUnique({
    where: { glpiTicketId: glpiId },
    select: {
      glpiTicketId: true,
      title: true,
      content: true,
      status: true,
      priority: true,
      dateCreation: true,
      dateModification: true,
      contractGroupName: true,
      requesterName: true,
      requesterEmail: true,
      requesterUserId: true,
      rawJson: true
    }
  });
  if (!ticket) {
    return null;
  }

  const history = await loadAndPersistWaitingParty(glpiId, ticket.status);
  let workingRaw: Record<string, unknown> =
    ticket.rawJson && typeof ticket.rawJson === "object" && !Array.isArray(ticket.rawJson)
      ? { ...(ticket.rawJson as Record<string, unknown>) }
      : {};
  let requesterName = ticket.requesterName?.trim() ? ticket.requesterName : null;
  let requesterEmail = ticket.requesterEmail ?? null;
  let requesterUserId = ticket.requesterUserId ?? null;
  const preObserverRows = extractObserversFromTicketRaw(workingRaw, requesterUserId ?? null);
  const hasUnnamedObserver = preObserverRows.some((o) => !o.displayName && !o.email);
  const shouldFetchFreshRaw =
    !requesterName || requesterUserId == null || preObserverRows.length === 0 || hasUnnamedObserver;
  /** Sempre que possível, atualiza o JSON do GLPI ao abrir o modal (conteúdo, anexos, imagens inline). */
  try {
    const freshUnknown = await fetchGlpiTicketJson(glpiId);
    const freshRaw = asJsonRecord(freshUnknown);
    if (Object.keys(freshRaw).length > 0) {
      workingRaw = { ...workingRaw, ...freshRaw };
    }
  } catch (error) {
    if (shouldFetchFreshRaw) {
      logger.warn({ glpiId, error: toErrorLog(error) }, "Falha no fetch em tempo real para complementar modal");
    }
  }

  const reqFb = extractRequesterContact(workingRaw);
  if (!requesterName?.trim()) {
    requesterName = reqFb.displayName ?? null;
  }
  if (!requesterEmail) {
    requesterEmail = reqFb.email ?? null;
  }
  if (requesterUserId == null) {
    requesterUserId = reqFb.userId;
  }
  const hasReqEmail = Boolean(requesterEmail && requesterEmail.trim().includes("@"));
  const requesterUserIdSafe = requesterUserId;
  const needsRequesterApi =
    requesterUserIdSafe != null && requesterUserIdSafe > 0 && (!requesterName?.trim() || !hasReqEmail);
  if (needsRequesterApi) {
    const c = await fetchCachedGlpiUserContact(requesterUserIdSafe as number);
    if (c?.displayName || c?.email) {
      if (!requesterName?.trim() && c.displayName) {
        requesterName = c.displayName;
      }
      if (!hasReqEmail && c.email) {
        requesterEmail = c.email;
      }
      if (c.displayName) {
        workingRaw.users_id_requester_name = c.displayName;
      }
      if (c.email) {
        workingRaw.users_id_requester_email = c.email;
      }
    }
  }
  const observerRows = extractObserversFromTicketRaw(workingRaw, requesterUserId ?? null);
  const observersResolved = await enrichObserverRows(observerRows);
  workingRaw.__gti_observers_resolved = observersResolved.map((r) => ({
    userId: r.userId,
    displayName: r.displayName,
    email: r.email
  }));
  const mergedTitle =
    typeof workingRaw.name === "string" && workingRaw.name.trim()
      ? workingRaw.name.trim()
      : (ticket.title ?? "");
  const mergedContent =
    typeof workingRaw.content === "string" && workingRaw.content.trim()
      ? String(workingRaw.content)
      : (ticket.content ?? "");

  const attachments = extractTicketDocumentsFromRaw(workingRaw);
  const sidebar = extractTicketSidebarFields(workingRaw);

  await prisma.ticket.update({
    where: { glpiTicketId: glpiId },
    data: {
      title: mergedTitle || ticket.title,
      content: mergedContent,
      requesterName: requesterName ?? null,
      requesterEmail: requesterEmail ?? null,
      requesterUserId,
      rawJson: workingRaw as InputJsonValue
    }
  });

  /** Registo de governança no GTI (opcional): `ticketId` no cadastro costuma ser o ID numérico GLPI. */
  let governance: Record<string, unknown> | null = null;
  try {
    const gov = await prisma.ticketGovernance.findFirst({
      where: {
        OR: [{ ticketId: String(glpiId) }, { ticketId: `#${glpiId}` }]
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        status: true,
        slaDeadline: true,
        priority: true,
        type: true,
        contract: { select: { id: true, number: true, name: true } }
      }
    });
    if (gov) {
      governance = {
        id: gov.id,
        status: gov.status,
        slaDeadline: gov.slaDeadline ? gov.slaDeadline.toISOString() : null,
        priority: gov.priority,
        type: gov.type,
        contractId: gov.contract.id,
        contractNumber: gov.contract.number,
        contractName: gov.contract.name
      };
    }
  } catch (error) {
    logger.warn({ glpiId, error: toErrorLog(error) }, "Não foi possível carregar governança GTI para o modal (ignorado)");
  }

  return {
    glpiTicketId: ticket.glpiTicketId,
    name: mergedTitle || ticket.title || "",
    content: mergedContent,
    statusLabel: ticket.status,
    priorityLabel: ticket.priority,
    statusId: extractGlpiScalarId(workingRaw.status),
    priorityId: extractGlpiScalarId(workingRaw.priority),
    dateCreation: ticket.dateCreation,
    dateModification: ticket.dateModification,
    contractGroupName: ticket.contractGroupName,
    requesterName: requesterName ?? "",
    requesterEmail: requesterEmail ?? "",
    requesterUserId,
    observers: observersResolved,
    context: extractTicketContext(workingRaw),
    sidebar,
    attachments,
    statusOptions: STATUS_OPTIONS,
    priorityOptions: PRIORITY_OPTIONS,
    history,
    governance
  };
}
