import type { PropsWithChildren, ReactNode } from "react";

/** Classe única para inputs/selects/textarea — mantém consistência sem alterar a paleta do tema. */
export const formControlClass =
  "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-1 focus:ring-slate-900/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

export const formLabelClass = "mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500";

export const formErrorClass = "mt-1 text-sm text-amber-800";

export const formHintClass = "mt-1 text-xs text-slate-500";

type FormSectionProps = PropsWithChildren<{
  title: string;
  description?: string;
  className?: string;
}>;

/** Agrupamento visual de campos (SaaS: blocos com título e descrição curta). */
export function FormSection({ title, description, className = "", children }: FormSectionProps): JSX.Element {
  return (
    <section className={`rounded-lg border border-slate-200/90 bg-slate-50/40 p-4 sm:p-5 ${className}`}>
      <header className="mb-4 border-b border-slate-200/80 pb-3">
        <h2 className="text-sm font-semibold tracking-tight text-slate-900">{title}</h2>
        {description ? <p className="mt-1 text-xs leading-relaxed text-slate-600">{description}</p> : null}
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

/** Label + erro + hint + controlo filho (uma célula de grelha). */
export function FormField({ label, htmlFor, required, error, hint, className = "", children }: FormFieldProps): JSX.Element {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className={formLabelClass}>
        {label}
        {required ? <span className="ml-0.5 text-amber-700">*</span> : null}
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
  busyLabel = "A processar…",
  children,
  onClick,
  className = ""
}: PrimaryButtonProps): JSX.Element {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
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
  className = ""
}: Omit<PrimaryButtonProps, "busy" | "busyLabel">): JSX.Element {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {children}
    </button>
  );
}

/** Botão «Novo…» das vistas em lista (mesmo estilo em todo o produto). */
export const buttonPrimaryClass =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2";

/** Botão compacto para linhas de tabela / cartões (ações secundárias). */
export const buttonSmallClass =
  "rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50";

/** Botão compacto primário (adicionar linha inline). */
export const buttonSmallPrimaryClass =
  "rounded-md bg-slate-900 px-3 py-1 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50";
