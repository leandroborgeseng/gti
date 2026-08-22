/**
 * Converte HTML completo em PDF (A4) via pdfkit (texto derivado do mesmo HTML).
 * Chromium/Puppeteer não entram neste módulo: o Next/webpack do Docker não
 * consegue resolver `@sparticuz/chromium` (só `exports`, sem `main`).
 */
export async function htmlToPdfBuffer(html: string, title: string): Promise<Buffer> {
  const PDFDocument = (await import("pdfkit")).default;
  const text = stripHtmlToText(html);
  const doc = new PDFDocument({
    margin: 50,
    size: "A4",
    info: { Title: title, Author: "SIGTI" },
    autoFirstPage: true
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  doc.fontSize(9).fillColor("#555").text(
    "PDF gerado a partir do mesmo HTML oficial do documento. Não é assinatura ICP-Brasil.",
    { align: "left" }
  );
  doc.moveDown(0.5);
  doc.fillColor("#111").fontSize(11).text(text || "(Sem conteúdo textual)", {
    align: "left",
    lineGap: 2,
    continued: false
  });
  doc.end();
  return done;
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/(div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
