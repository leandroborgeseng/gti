import type { Route } from "next";
import Link from "next/link";
import type { ManualBlock, ManualPart, ManualSection } from "@/content/manual-do-utilizador";
import { MANUAL_LAST_UPDATED, MANUAL_SECTIONS } from "@/content/manual-do-utilizador";
import { Card } from "@/components/ui/card";

function renderParts(parts: ManualPart[]): JSX.Element[] {
  return parts.map((part, i) => {
    if (typeof part === "string") {
      return <span key={i}>{part}</span>;
    }
    return (
      <Link
        key={i}
        href={part.href as Route}
        className="font-medium text-foreground underline decoration-muted-foreground underline-offset-2 hover:decoration-foreground"
      >
        {part.label}
      </Link>
    );
  });
}

function renderBlock(block: ManualBlock, key: string): JSX.Element {
  switch (block.kind) {
    case "p":
      return (
        <p key={key} className="text-sm leading-relaxed text-muted-foreground">
          {renderParts(block.parts)}
        </p>
      );
    case "ul":
      return (
        <ul key={key} className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          {block.items.map((item) => (
            <li key={item} className="leading-relaxed">
              {item}
            </li>
          ))}
        </ul>
      );
    case "tip":
      return (
        <div
          key={key}
          className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
          role="note"
        >
          {block.text}
        </div>
      );
    case "roles":
      return (
        <div
          key={key}
          className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-border dark:bg-muted/40 dark:text-muted-foreground"
          role="note"
        >
          <span className="font-medium text-foreground">Permissões: </span>
          {block.text}
        </div>
      );
    default: {
      const _exhaustive: never = block;
      return _exhaustive;
    }
  }
}

function collectToc(sections: ManualSection[]): { id: string; title: string }[] {
  const out: { id: string; title: string }[] = [];
  for (const s of sections) {
    out.push({ id: s.id, title: s.title });
    if (s.children) {
      for (const c of s.children) {
        out.push({ id: c.id, title: c.title });
      }
    }
  }
  return out;
}

function SectionBody({ section }: { section: ManualSection }): JSX.Element {
  return (
    <div className="space-y-4">
      {section.blocks.map((b, i) => renderBlock(b, `${section.id}-${i}`))}
      {section.children?.length ? (
        <div className="space-y-8 border-l-2 border-muted pl-4 pt-2">
          {section.children.map((child) => (
            <div key={child.id} id={child.id} className="scroll-mt-24 space-y-3">
              <h3 className="text-base font-semibold text-foreground">{child.title}</h3>
              <div className="space-y-3">
                {child.blocks.map((b, i) => renderBlock(b, `${child.id}-${i}`))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ManualView(): JSX.Element {
  const toc = collectToc(MANUAL_SECTIONS);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ajuda</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Manual do sistema</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Descrição das áreas e fluxos para quem utiliza a aplicação. Conteúdo mantido em conjunto com o código: data de referência{" "}
          <time dateTime={MANUAL_LAST_UPDATED}>{MANUAL_LAST_UPDATED}</time>.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] lg:items-start">
        <aside className="lg:sticky lg:top-20">
          <Card className="p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nesta página</p>
            <nav aria-label="Índice do manual" className="mt-3">
              <ol className="space-y-2 text-sm">
                {toc.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className="text-muted-foreground underline decoration-transparent underline-offset-2 transition hover:text-foreground hover:decoration-muted-foreground"
                    >
                      {item.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </Card>
        </aside>

        <div className="min-w-0 space-y-10">
          {MANUAL_SECTIONS.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-24 space-y-4">
              <h2 className="border-b border-border pb-2 text-lg font-semibold text-foreground">{section.title}</h2>
              <SectionBody section={section} />
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
