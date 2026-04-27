import type { PropsWithChildren, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Classe única para inputs/selects/textarea — alinhada ao tema shadcn (`globals.css`). */
export const formControlClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export const formLabelClass =
  "mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground";

export const formErrorClass = "mt-1 text-sm text-destructive";

export const formHintClass = "mt-1 text-xs text-muted-foreground";

type FormSectionProps = PropsWithChildren<{
  title: string;
  description?: string;
  className?: string;
}>;

/** Agrupamento visual de campos (SaaS: blocos com título e descrição curta). */
export function FormSection({ title, description, className, children }: FormSectionProps): JSX.Element {
  return (
    <section className={cn("rounded-lg border border-border bg-card/50 p-4 sm:p-5", className)}>
      <header className="mb-4 border-b border-border pb-3">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
        {description ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
      </header>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

type FormFieldProps = PropsWithChildren<{
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string | null;
  hint?: string;
  className?: string;
}>;

/** Label + erro + hint + controlo filho (uma célula de grade). */
export function FormField({ label, htmlFor, required, error, hint, className, children }: FormFieldProps): JSX.Element {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className={formLabelClass}>
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </label>
      {children}
      {hint ? <p className={formHintClass}>{hint}</p> : null}
      {error ? <p className={formErrorClass}>{error}</p> : null}
    </div>
  );
}

type PrimaryButtonProps = {
  type?: "button" | "submit";
  disabled?: boolean;
  busy?: boolean;
  busyLabel?: string;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
};

export function PrimaryButton({
  type = "button",
  disabled,
  busy,
  busyLabel = "Processando…",
  children,
  onClick,
  className
}: PrimaryButtonProps): JSX.Element {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
    >
      {busy ? busyLabel : children}
    </button>
  );
}

export function SecondaryButton({
  type = "button",
  disabled,
  children,
  onClick,
  className
}: Omit<PrimaryButtonProps, "busy" | "busyLabel">): JSX.Element {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
    >
      {children}
    </button>
  );
}

/** Botão «Novo…» das vistas em lista (mesmo estilo em todo o produto). */
export const buttonPrimaryClass =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/** Botão compacto para linhas de tabela / cartões (ações secundárias). */
export const buttonSmallClass =
  "rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-sm transition hover:bg-accent hover:text-accent-foreground disabled:opacity-50";

/** Botão compacto primário (adicionar linha inline). */
export const buttonSmallPrimaryClass =
  "rounded-md bg-primary px-3 py-1 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:opacity-50";
