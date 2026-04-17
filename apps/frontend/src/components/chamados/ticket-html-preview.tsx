"use client";

import { useMemo } from "react";
import { sanitizeAndProxyTicketHtml } from "@/lib/glpi-ticket-html";

type Props = {
  html: string;
  className?: string;
  /** Texto quando `html` está vazio após sanitização */
  emptyLabel?: string;
};

/**
 * Pré-visualização do conteúdo GLPI como HTML (sanitizado + proxy de anexos no browser).
 */
export function TicketHtmlPreview({ html, className, emptyLabel = "—" }: Props): JSX.Element {
  const safe = useMemo(() => sanitizeAndProxyTicketHtml(html), [html]);
  const isEmpty = !safe.trim() || safe === "<p></p>" || safe === "<p><br></p>";

  if (isEmpty) {
    return <p className={`ticket-html-preview ticket-html-preview--empty ${className ?? ""}`.trim()}>{emptyLabel}</p>;
  }

  return (
    <div
      className={`ticket-html-preview ql-snow ${className ?? ""}`.trim()}
      role="region"
      aria-label="Pré-visualização do conteúdo"
    >
      <div className="ql-editor" dangerouslySetInnerHTML={{ __html: safe }} />
    </div>
  );
}
