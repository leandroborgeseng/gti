function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function authorFromUserObject(value: unknown): string | null {
  const o = asRecord(value);
  const name = o.name ?? o.completename ?? o.friendlyname ?? o.login ?? o.realname;
  if (typeof name === "string" && name.trim()) {
    return name.trim();
  }
  const fn = o.firstname;
  const ln = o.lastname;
  if (typeof fn === "string" || typeof ln === "string") {
    const joined = [fn, ln].filter(Boolean).join(" ").trim();
    return joined || null;
  }
  return null;
}

/** E-mail em objeto user/requester GLPI (campos variam por versão / expansão da API). */
function emailFromUserObject(value: unknown): string | null {
  const o = asRecord(value);
  const candidates = [o.email, o.alternative_email, o.user_email, o.default_email, o.mail];
  for (const c of candidates) {
    if (typeof c === "string" && c.includes("@")) {
      return c.trim().toLowerCase();
    }
  }
  return null;
}

function parsePositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const n = Number(value.trim());
    return n > 0 ? n : null;
  }
  return null;
}

/** Atores `team` / `actors` da API GLPI: grupo técnico costuma vir explícito; o requerente também pode vir só aqui. */
function isGroupLikeActorRow(o: Record<string, unknown>): boolean {
  const t = String(o.type ?? o.itemtype ?? o.item_type ?? o.actor_type ?? "").toLowerCase();
  if (t.includes("group")) {
    return true;
  }
  if (t.includes("supplier") || t.includes("fornecedor")) {
    return true;
  }
  const href = String(o.href ?? o.link ?? "").toLowerCase();
  return href.includes("group.form") || href.includes("/group/");
}

/** Papel de requerente (strings ou constante numérica 1 em CommonITILActor::REQUESTER). */
function isStrictRequesterRole(o: Record<string, unknown>): boolean {
  const r = String(o.role ?? o.actor_role ?? o.relation ?? "").toLowerCase();
  if (r.includes("request") || r.includes("requerente") || r.includes("solicit")) {
    return true;
  }
  if (r.includes("demandeur") || r.includes("petic")) {
    return true;
  }
  const rn = Number(o.role);
  return rn === 1;
}

function isRecipientLikeRole(o: Record<string, unknown>): boolean {
  const r = String(o.role ?? o.actor_role ?? o.relation ?? "").toLowerCase();
  return r.includes("recipient") || r.includes("destinat");
}

/** Evita confundir técnico/agente atribuído com o requerente na lista `team`. */
function isAssignedOrTechActorRow(o: Record<string, unknown>): boolean {
  const r = String(o.role ?? o.actor_role ?? o.relation ?? "").toLowerCase();
  return (
    r.includes("assign") ||
    r.includes("tech") ||
    r.includes("atribu") ||
    r.includes("observer") ||
    r.includes("observador") ||
    r.includes("supplier") ||
    r.includes("fornecedor")
  );
}

function userIdFromActorRow(o: Record<string, unknown>): number | null {
  const it = String(o.itemtype ?? o.item_type ?? "").toLowerCase();
  if (it.includes("user")) {
    return (
      parsePositiveInt(o.items_id ?? o.itemsId ?? o.actors_id ?? o.users_id ?? o.user_id ?? o.id) ?? null
    );
  }
  if (!isGroupLikeActorRow(o)) {
    return (
      parsePositiveInt(o.actors_id ?? o.items_id ?? o.itemsId ?? o.users_id ?? o.user_id ?? o.id) ?? null
    );
  }
  return null;
}

export type RequesterContact = {
  displayName: string | null;
  email: string | null;
  /** GLPI `users_id` do requerente, quando identificável. */
  userId: number | null;
};

/**
 * Melhor esforço: solicitante (nome, e-mail, id) a partir do JSON bruto do GLPI.
 * O e-mail só aparece se a pesquisa / payload incluir o objeto user expandido;
 * caso contrário use `userId` com GET /User/:id na API GLPI.
 */
export function extractRequesterContact(rawJson: unknown): RequesterContact {
  const ticket = asRecord(rawJson);

  let displayName: string | null = null;
  let email: string | null = null;
  let userId: number | null = null;

  const fillNameEmail = (u: unknown): void => {
    if (!displayName) {
      displayName = authorFromUserObject(u);
    }
    if (!email) {
      email = emailFromUserObject(u);
    }
  };

  const fillRequesterFromUserObject = (u: unknown): void => {
    fillNameEmail(u);
    if (!userId) {
      const o = asRecord(u);
      userId = parsePositiveInt(o.users_id ?? o.id ?? o.user_id);
    }
  };

  const uidReq = ticket.users_id_requester;
  if (uidReq && typeof uidReq === "object" && !Array.isArray(uidReq)) {
    fillRequesterFromUserObject(uidReq);
  } else if (uidReq !== undefined && uidReq !== null) {
    if (!userId) {
      userId = parsePositiveInt(uidReq);
    }
  }

  const uidRecipientObj = ticket.users_id_recipient;
  if (uidRecipientObj && typeof uidRecipientObj === "object" && !Array.isArray(uidRecipientObj)) {
    fillRequesterFromUserObject(uidRecipientObj);
  } else if (uidRecipientObj !== undefined && uidRecipientObj !== null && !userId) {
    userId = parsePositiveInt(uidRecipientObj) ?? userId;
  }

  fillRequesterFromUserObject(ticket.user ?? ticket.requester);
  if (typeof ticket.requester === "number" || typeof ticket.requester === "string") {
    if (!userId) {
      userId = parsePositiveInt(ticket.requester);
    }
  }

  const reqArr = ticket._users_id_requester;
  if (Array.isArray(reqArr) && reqArr.length > 0) {
    fillRequesterFromUserObject(reqArr[0]);
  } else if (reqArr && typeof reqArr === "object" && !Array.isArray(reqArr)) {
    fillRequesterFromUserObject(reqArr);
  }

  if (!userId) {
    userId = parsePositiveInt(ticket.users_id_requester);
  }

  const recipient = ticket._users_id_recipient;
  if (Array.isArray(recipient) && recipient.length > 0) {
    fillRequesterFromUserObject(recipient[0]);
  } else if (recipient && typeof recipient === "object" && !Array.isArray(recipient)) {
    fillRequesterFromUserObject(recipient);
  }

  /**
   * Lista `team` / `actors` (GLPI v2): entrada com papel de requerente e tipo utilizador,
   * mesmo quando `users_id_requester` não vem no JSON da listagem.
   */
  const tryFillFromTeamOrActors = (strictRequesterOnly: boolean): void => {
    const lists = [ticket.team, ticket._team, ticket.actors, ticket._actors];
    for (const list of lists) {
      if (!Array.isArray(list)) {
        continue;
      }
      for (const row of list) {
        const o = asRecord(row);
        if (isGroupLikeActorRow(o)) {
          continue;
        }
        if (strictRequesterOnly && isAssignedOrTechActorRow(o)) {
          continue;
        }
        const roleOk = strictRequesterOnly ? isStrictRequesterRole(o) : isRecipientLikeRole(o);
        if (!roleOk) {
          continue;
        }
        fillRequesterFromUserObject(o.user ?? o.User ?? o.user_link ?? o.user_link_item);
        if (!displayName) {
          const n =
            o.display_name ??
            o.displayName ??
            o.completename ??
            o.name ??
            o.username ??
            o.login ??
            o.friendlyname;
          if (typeof n === "string" && n.trim()) {
            displayName = n.trim();
          }
        }
        if (!email) {
          const em = o.email ?? o.user_email ?? o.default_email ?? o.alternative_email;
          if (typeof em === "string" && em.includes("@")) {
            email = em.trim().toLowerCase();
          }
        }
        if (!userId) {
          const fromRow = userIdFromActorRow(o);
          if (fromRow !== null) {
            userId = fromRow;
          }
        }
        return;
      }
    }
    const singleActor = ticket.actor;
    if (singleActor && typeof singleActor === "object" && !Array.isArray(singleActor)) {
      const o = asRecord(singleActor);
      if (!isGroupLikeActorRow(o) && !(strictRequesterOnly && isAssignedOrTechActorRow(o))) {
        const roleOk = strictRequesterOnly ? isStrictRequesterRole(o) : isRecipientLikeRole(o);
        if (roleOk) {
          fillRequesterFromUserObject(o.user ?? o.User ?? o.user_link ?? o.user_link_item);
          if (!displayName) {
            const n = o.display_name ?? o.displayName ?? o.completename ?? o.name ?? o.login;
            if (typeof n === "string" && n.trim()) {
              displayName = n.trim();
            }
          }
          if (!email) {
            const em = o.email ?? o.user_email ?? o.default_email;
            if (typeof em === "string" && em.includes("@")) {
              email = em.trim().toLowerCase();
            }
          }
          if (!userId) {
            const fromRow = userIdFromActorRow(o);
            if (fromRow !== null) {
              userId = fromRow;
            }
          }
        }
      }
    }
  };

  tryFillFromTeamOrActors(true);
  if (!displayName && !userId) {
    tryFillFromTeamOrActors(false);
  }

  if (!displayName) {
    const nameFields = [
      ticket.users_id_recipient_name,
      ticket.users_id_requester_name,
      ticket.users_id_requester_label,
      ticket.requester_name,
      ticket.requester_completename,
      ticket.author_name
    ];
    for (const f of nameFields) {
      if (typeof f === "string" && f.trim()) {
        displayName = f.trim();
        break;
      }
    }
  }

  if (!email) {
    const mailFields = [ticket.requester_email, ticket.users_id_requester_email, ticket.user_email, ticket.email];
    for (const f of mailFields) {
      if (typeof f === "string" && f.includes("@")) {
        email = f.trim().toLowerCase();
        break;
      }
    }
  }

  return { displayName, email, userId };
}

/**
 * Melhor esforço: nome de quem abriu / solicitante a partir do JSON bruto do GLPI.
 */
export function extractRequesterDisplayName(rawJson: unknown): string | null {
  return extractRequesterContact(rawJson).displayName;
}

export function extractRequesterEmail(rawJson: unknown): string | null {
  return extractRequesterContact(rawJson).email;
}

export function extractRequesterUserId(rawJson: unknown): number | null {
  return extractRequesterContact(rawJson).userId;
}
