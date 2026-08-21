/**
 * Converte HTML completo em PDF (A4).
 * Preferência: Chromium (@sparticuz/chromium + puppeteer-core).
 * Fallback: pdfkit com texto extraído do HTML.
 */
export async function htmlToPdfBuffer(html: string, title: string): Promise<Buffer> {
  try {
    return await renderWithChromium(html);
  } catch (err) {
    console.warn("[html-to-pdf] Chromium indisponível, usando fallback pdfkit:", err);
    return renderWithPdfkit(html, title);
  }
}

async function renderWithChromium(html: string): Promise<Buffer> {
  const chromium = (await import("@sparticuz/chromium")).default;
  const puppeteer = await import("puppeteer-core");
  const executablePath = await chromium.executablePath();
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath,
    headless: true,
    defaultViewport: { width: 1280, height: 720 }
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 60_000 });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", right: "14mm", bottom: "16mm", left: "14mm" }
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

async function renderWithPdfkit(html: string, title: string): Promise<Buffer> {
  const PDFDocument = (await import("pdfkit")).default;
  const text = stripHtmlToText(html);
  const doc = new PDFDocument({ margin: 50, size: "A4", info: { Title: title, Author: "SIGTI" } });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  doc.fontSize(9).fillColor("#666").text(
    "PDF gerado em modo texto (Chromium indisponível neste ambiente). Conteúdo derivado do HTML oficial.",
    { align: "left" }
  );
  doc.moveDown();
  doc.fillColor("#111").fontSize(11).text(text || "(Sem conteúdo)", { align: "left", lineGap: 2 });
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
