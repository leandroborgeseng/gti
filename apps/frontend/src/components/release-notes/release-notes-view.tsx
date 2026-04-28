import { Card } from "@/components/ui/card";

type ReleaseLine =
  | { kind: "h1"; text: string }
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "li"; text: string }
  | { kind: "p"; text: string };

function parseReleaseNotes(markdown: string): ReleaseLine[] {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.startsWith("### ")) return { kind: "h3", text: line.slice(4).trim() };
      if (line.startsWith("## ")) return { kind: "h2", text: line.slice(3).trim() };
      if (line.startsWith("# ")) return { kind: "h1", text: line.slice(2).trim() };
      if (line.startsWith("- ")) return { kind: "li", text: line.slice(2).trim() };
      return { kind: "p", text: line };
    });
}

function cleanInlineMarkdown(text: string): string {
  return text.replace(/`([^`]+)`/g, "$1");
}

export function ReleaseNotesView({ markdown }: { markdown: string }): JSX.Element {
  const lines = parseReleaseNotes(markdown);
  const title = lines.find((line) => line.kind === "h1")?.text ?? "Notas de versão";

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ajuda</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Mudanças relevantes do sistema, escritas para quem usa, administra ou opera a plataforma.
        </p>
      </header>

      <Card className="space-y-4 p-5">
        {lines
          .filter((line) => line.kind !== "h1")
          .map((line, index) => {
            const text = cleanInlineMarkdown(line.text);
            if (line.kind === "h2") {
              return (
                <h2 key={index} className="border-b border-border pb-2 pt-2 text-lg font-semibold text-foreground">
                  {text}
                </h2>
              );
            }
            if (line.kind === "h3") {
              return (
                <h3 key={index} className="pt-2 text-base font-semibold text-foreground">
                  {text}
                </h3>
              );
            }
            if (line.kind === "li") {
              return (
                <div key={index} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
                  <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
                  <p>{text}</p>
                </div>
              );
            }
            return (
              <p key={index} className="text-sm leading-relaxed text-muted-foreground">
                {text}
              </p>
            );
          })}
      </Card>
    </div>
  );
}
