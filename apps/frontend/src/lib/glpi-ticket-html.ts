import DOMPurify from "isomorphic-dompurify";
import type { Config } from "dompurify";
import { env } from "@/glpi/config/env";

const SANITIZE: Config = {
  ALLOWED_TAGS: [
    "a",
    "abbr",
    "b",
    "blockquote",
    "br",
    "caption",
    "code",
    "col",
    "colgroup",
    "div",
    "em",
    "font",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "i",
    "img",
    "li",
    "ol",
    "p",
    "pre",
    "s",
    "span",
    "strong",
    "sub",
    "sup",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "u",
    "ul",
    "video",
    "source"
  ],
  ALLOWED_ATTR: [
    "href",
    "src",
    "alt",
    "title",
    "class",
    "style",
    "id",
    "name",
    "colspan",
    "rowspan",
    "width",
    "height",
    "align",
    "valign",
    "target",
    "rel",
    "color",
    "face",
    "size",
    "bgcolor",
    "border",
    "cellpadding",
    "cellspacing"
  ],
  ALLOW_DATA_ATTR: false,
  ADD_ATTR: ["loading"]
};

/** Normaliza URL para o proxy (relativas, protocol-relative, mesmo host GLPI). */
export function normalizeMediaUrlForProxy(raw: string): string {
  let u = raw.trim();
  if (!u || u.startsWith("data:") || u.startsWith("blob:") || u.startsWith("#")) {
    return u;
  }
  if (u.startsWith("//")) {
    try {
      const api = new URL(env.GLPI_BASE_URL);
      u = `${api.protocol}${u}`;
    } catch {
      u = `https:${u}`;
    }
  }
  if (u.startsWith("/")) {
    try {
      return new URL(u, env.GLPI_BASE_URL).toString();
    } catch {
      return u;
    }
  }
  return u;
}

/** Reescreve imagens, vídeos e links do GLPI para passar pelo proxy local (só no browser). */
export function proxyGlpiAssetsInHtml(html: string): string {
  if (typeof window === "undefined") {
    return html;
  }
  try {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
    const root = doc.body.firstElementChild;
    if (!root) {
      return html;
    }
    const proxyAttr = (el: Element, attr: "src" | "href"): void => {
      const raw = el.getAttribute(attr);
      if (!raw) {
        return;
      }
      if (raw.startsWith("data:") || raw.startsWith("blob:") || raw.startsWith("#")) {
        return;
      }
      const absolute = normalizeMediaUrlForProxy(raw);
      el.setAttribute(attr, `/api/glpi-asset?url=${encodeURIComponent(absolute)}`);
    };

    root.querySelectorAll("img[src]").forEach((el) => {
      proxyAttr(el, "src");
      if (!el.getAttribute("loading")) {
        el.setAttribute("loading", "lazy");
      }
    });
    root.querySelectorAll("video[src], source[src]").forEach((el) => {
      proxyAttr(el, "src");
    });
    root.querySelectorAll("a[href]").forEach((el) => {
      proxyAttr(el, "href");
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
    });
    return root.innerHTML;
  } catch {
    return html;
  }
}

/** HTML seguro para pré-visualização (remove scripts; imagens via proxy no cliente). */
export function sanitizeAndProxyTicketHtml(html: string): string {
  const clean = DOMPurify.sanitize(html || "", SANITIZE);
  return proxyGlpiAssetsInHtml(clean);
}
