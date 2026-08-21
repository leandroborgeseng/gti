"use client";

import { DocumentsCentralPanel } from "@/components/documents/documents-central-panel";

/** Central de Documentos — usuários internos (tickets 103/104). */
export default function DocumentosPage(): JSX.Element {
  return <DocumentsCentralPanel mode="internal" />;
}
