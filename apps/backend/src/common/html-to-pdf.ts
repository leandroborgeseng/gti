/**
 * Converte HTML completo em PDF (A4).
 * Padrão: pdfkit (estável em container). Chromium opcional via PDF_ENGINE=chromium|auto.
 */
export async function htmlToPdfBuffer(html: string, title: string): Promise<Buffer> {
  const engine = (process.env.PDF_ENGINE ?? "pdfkit").toLowerCase().trim();

  if (engine === "chromium") {
    return renderWithChromium(html);
  }

  if (engine === "auto") {
    try {
      return await Promise.race([
        renderWithChromium(html),
        new Promise<Buffer>((_, reject) =>
          setTimeout(() => reject(new Error("Timeout ao iniciar Chromium (15s)")), 15_000)
        )
      ]);
    } catch (err) {
      console.warn("[html-to-pdf] Chromium indisponível, usando fallback pdfkit:", err);
      return renderWithPdfkit(html, title);
    }
  }

  return renderWithPdfkit(html, title);
}

async function renderWithChromium(html: string): Promise<Buffer> {
  const chromiumMod = await import(/* webpackIgnore: true */ "@sparticuz/chromium");
  const chromium = chromiumMod.default;
  try {
    chromium.setGraphicsMode = false;
  } catch {
    /* ignore */
  }
  const puppeteer = await import(/* webpackIgnore: true */ "puppeteer-core");
  const executablePath = await chromium.executablePath();
  const browser = await puppeteer.launch({
    args: [...chromium.args, "--font-render-hinting=none", "--disable-dev-shm-usage"],
    executablePath,
    headless: true,
    defaultViewport: { width: 1280, height: 720 }
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 45_000 });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", right: "14mm", bottom: "16mm", left: "14mm" }
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => undefined);
  }
}

async function renderWithPdfkit(html: string, title: string): Promise<Buffer> {
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
