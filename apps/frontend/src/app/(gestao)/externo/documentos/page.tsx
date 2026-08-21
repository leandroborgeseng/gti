"use client";

import { DocumentsCentralPanel } from "@/components/documents/documents-central-panel";

/**
 * Central de Documentos (tickets 103/104) — portal externo.
 */
export default function ExternoDocumentosPage(): JSX.Element {
  return <DocumentsCentralPanel mode="external" />;
}
