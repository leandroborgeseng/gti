import { SecondaryButton, formControlClass } from "@/components/ui/form-primitives";

export type EntitySelectOption = { value: string; label: string };

type Props = {
  id: string;
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  options: EntitySelectOption[];
  placeholder?: string;
  addNewLabel: string;
  onAddNew: () => void;
  disabled?: boolean;
  error?: string | null;
  hint?: string;
};

/**
 * Seletor de entidade + ação «Novo» no mesmo contexto (abre modal via `onAddNew`).
 * Não altera cores; usa os mesmos tokens slate do resto da app.
 */
export function EntitySelectWithCreate({
  id,
  label,
  required,
  value,
  onChange,
  options,
  placeholder = "Selecione…",
  addNewLabel,
  onAddNew,
  disabled,
  error,
  hint
}: Props): JSX.Element {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
        {required ? <span className="ml-0.5 text-amber-700">*</span> : null}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <select
          id={id}
          className={`${formControlClass} min-w-0 flex-1`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={hint ? `${id}-hint` : undefined}
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <SecondaryButton type="button" onClick={onAddNew} disabled={disabled} className="shrink-0 sm:w-auto">
          {addNewLabel}
        </SecondaryButton>
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
      {error ? <p className="mt-1 text-sm text-amber-800">{error}</p> : null}
    </div>
  );
}
