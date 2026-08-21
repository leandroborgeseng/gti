/**
 * Com `paths` a apontar `pdfkit` para `./node_modules/pdfkit`, o TS deixa de ligar
 * automaticamente a `@types/pdfkit`. Declaração mínima para `next build` + arquivos `@gestao/*`.
 */
declare module "pdfkit" {
  interface PDFDocumentOptions {
    margin?: number;
    size?: string;
    info?: { Title?: string; Author?: string };
    autoFirstPage?: boolean;
  }

  interface PDFTextOptions {
    align?: "left" | "center" | "right" | "justify";
    lineGap?: number;
    continued?: boolean;
  }

  class PDFDocument {
    constructor(options?: PDFDocumentOptions);
    on(event: "data", listener: (chunk: Buffer) => void): this;
    on(event: "end", listener: () => void): this;
    on(event: "error", listener: (err: Error) => void): this;
    fontSize(size: number): this;
    fillColor(color: string): this;
    text(text: string, options?: PDFTextOptions): this;
    moveDown(lines?: number): this;
    end(): void;
  }

  export default PDFDocument;
}
