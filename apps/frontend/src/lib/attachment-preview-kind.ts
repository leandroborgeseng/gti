/** Quais tipos de anexo conseguimos mostrar no modal antes de descarregar. */
export function attachmentPreviewKind(mimeType: string): "pdf" | "image" | "none" {
  const main = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (main === "application/pdf") return "pdf";
  if (main.startsWith("image/")) return "image";
  return "none";
}
