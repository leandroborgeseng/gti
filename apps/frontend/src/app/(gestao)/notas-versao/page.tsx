import { readFile } from "node:fs/promises";
import path from "node:path";
import { ReleaseNotesView } from "@/components/release-notes/release-notes-view";

/** Revalida a cada 5 min; evita force-dynamic em toda navegação. */
export const revalidate = 300;

async function readReleaseNotes(): Promise<string> {
  const candidates = [
    path.resolve(process.cwd(), "../../NOTAS_DE_VERSAO.md"),
    path.resolve(process.cwd(), "NOTAS_DE_VERSAO.md")
  ];

  for (const filePath of candidates) {
    try {
      return await readFile(filePath, "utf8");
    } catch {
      // Tenta o próximo caminho: em dev o cwd costuma ser apps/frontend; no Docker, /app/apps/frontend.
    }
  }

  return "# Notas de versão\n\nAs notas de versão ainda não estão disponíveis neste ambiente.";
}

export default async function ReleaseNotesPage(): Promise<JSX.Element> {
  const markdown = await readReleaseNotes();
  return <ReleaseNotesView markdown={markdown} />;
}
