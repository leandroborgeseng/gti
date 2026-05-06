import type { ReactNode } from "react";
import type { Route } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const ASSIGNMENTS_PAGE = "/minhas-atribuicoes";

export function AssignmentSummaryStatLink({
  anchor,
  children,
  className
}: {
  anchor: string;
  children: React.ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <Link
      href={`${ASSIGNMENTS_PAGE}#${anchor}` as Route}
      className={cn(
        "block rounded-xl outline-none ring-offset-background transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
    >
      {children}
    </Link>
  );
}

export function AssignmentSection({
  sectionId,
  title,
  count,
  empty,
  footer,
  children
}: {
  sectionId: string;
  title: string;
  count: number;
  empty: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}): JSX.Element {
  const isEmpty = count === 0;
  return (
    <section id={sectionId} data-assign-section-empty={isEmpty ? "1" : undefined}>
      <Card className="p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{count}</span>
        </div>
        {isEmpty ? (
          <p className="mt-3 text-sm text-muted-foreground">{empty}</p>
        ) : (
          <div className="mt-4 space-y-3">{children}</div>
        )}
      </Card>
      {footer}
    </section>
  );
}

export function taskAssignmentFootnote(task: {
  internalResponsible?: string | null;
  assigneeExternal?: string | null;
}): ReactNode | null {
  const ir = task.internalResponsible?.trim();
  const ae = task.assigneeExternal?.trim();
  if (!ir && !ae) return null;
  const parts = [
    ir ? `Resp. interno (campo texto): ${ir}` : null,
    ae ? `Externo: ${ae}` : null
  ].filter(Boolean);
  return parts.join(" · ");
}

export function StatusPill({
  children,
  tone = "neutral"
}: {
  children: string;
  tone?: "neutral" | "green" | "amber" | "red";
}): JSX.Element {
  const cls =
    tone === "green"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : tone === "red"
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-border bg-muted/40 text-muted-foreground";
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

export function AssignmentRowCard({
  title,
  meta,
  pill,
  pillTone = "neutral",
  className,
  extraBelowMeta
}: {
  title: ReactNode;
  meta: ReactNode;
  pill?: string;
  pillTone?: "neutral" | "green" | "amber" | "red";
  className?: string;
  extraBelowMeta?: ReactNode;
}): JSX.Element {
  return (
    <div className={cn("rounded-lg border bg-background p-3", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">{title}</div>
        {pill ? <StatusPill tone={pillTone}>{pill}</StatusPill> : null}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{meta}</p>
      {extraBelowMeta ? <div className="mt-1 text-xs text-muted-foreground">{extraBelowMeta}</div> : null}
    </div>
  );
}

export function ListTruncationFooter({
  truncated,
  label,
  maxItems = 100
}: {
  truncated: boolean;
  label: string;
  maxItems?: number;
}): JSX.Element | null {
  if (!truncated) return null;
  return (
    <p className="mt-3 text-xs text-muted-foreground" role="status">
      Lista «{label}» limitada a {maxItems} registos no servidor — pode haver mais itens não mostrados.
    </p>
  );
}
