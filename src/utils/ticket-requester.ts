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

  fillRequesterFromUserObject(ticket.user ?? ticket.requester);
  if (typeof ticket.requester === "number" || typeof ticket.requester === "string") {
    if (!userId) {
      userId = parsePositiveInt(ticket.requester);
    }
  }

  const reqArr = ticket._users_id_requester;
  if (Array.isArray(reqArr) && reqArr.length > 0) {
    fillRequesterFromUserObject(reqArr[0]);
  }

  if (!userId) {
    userId = parsePositiveInt(ticket.users_id_requester);
  }

  const recipient = ticket._users_id_recipient;
  if (Array.isArray(recipient) && recipient.length > 0) {
    fillNameEmail(recipient[0]);
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
