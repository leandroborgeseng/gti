function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function authorFromUserObject(value: unknown): string | null {
  const o = asRecord(value);
  const name = o.name ?? o.login ?? o.realname;
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

/**
 * Melhor esforço: nome de quem abriu / solicitante a partir do JSON bruto do GLPI.
 */
export function extractRequesterDisplayName(rawJson: unknown): string | null {
  const ticket = asRecord(rawJson);

  const fromUser = authorFromUserObject(ticket.user ?? ticket.requester);
  if (fromUser) {
    return fromUser;
  }

  const recipient = ticket._users_id_recipient;
  if (Array.isArray(recipient) && recipient.length > 0) {
    const n = authorFromUserObject(recipient[0]);
    if (n) {
      return n;
    }
  }

  const req = ticket._users_id_requester;
  if (Array.isArray(req) && req.length > 0) {
    const first = req[0];
    if (first && typeof first === "object") {
      const n = authorFromUserObject(first);
      if (n) {
        return n;
      }
    }
  }

  const nameFields = [
    ticket.users_id_recipient_name,
    ticket.users_id_requester_name,
    ticket.requester_name,
    ticket.author_name
  ];
  for (const f of nameFields) {
    if (typeof f === "string" && f.trim()) {
      return f.trim();
    }
  }

  return null;
}
