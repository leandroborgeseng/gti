"use client";

import { ChevronsUpDown, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { formControlClass } from "@/components/ui/form-primitives";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getUserOptions, type UserOption } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function optionFromLinked(user: {
  id: string;
  name?: string;
  email: string;
  organizationAcronym?: string | null;
  active?: boolean;
}): UserOption {
  return {
    id: user.id,
    name: user.name?.trim() || user.email,
    email: user.email,
    organizationAcronym: user.organizationAcronym ?? null,
    active: user.active !== false
  };
}

type UserMultiSelectProps = {
  id?: string;
  label?: string;
  value: string[];
  onChange: (ids: string[]) => void;
  /** Usuários já vinculados (podem incluir inativos) para chips e rótulos. */
  linkedUsers?: Array<{
    id: string;
    name?: string;
    email: string;
    organizationAcronym?: string | null;
    active?: boolean;
  }>;
  placeholder?: string;
  disabled?: boolean;
  /** Quantidade de chips visíveis antes do resumo +N. */
  maxVisibleChips?: number;
  hint?: string;
  className?: string;
};

/**
 * Multi-select de usuários do cadastro central, com pesquisa por nome/e-mail,
 * chips resumidos (+N) e indicação de usuários inativos já vinculados.
 */
export function UserMultiSelect({
  id,
  label,
  value,
  onChange,
  linkedUsers = [],
  placeholder = "Selecionar usuários…",
  disabled,
  maxVisibleChips = 2,
  hint,
  className
}: UserMultiSelectProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { data: options = [], isLoading } = useQuery({
    queryKey: queryKeys.userOptions,
    queryFn: getUserOptions,
    staleTime: 60_000
  });

  const linkedById = useMemo(() => {
    const map = new Map<string, UserOption>();
    for (const user of linkedUsers) {
      map.set(user.id, optionFromLinked(user));
    }
    return map;
  }, [linkedUsers]);

  const optionsById = useMemo(() => {
    const map = new Map<string, UserOption>();
    for (const opt of options) map.set(opt.id, opt);
    for (const [uid, user] of linkedById) {
      if (!map.has(uid)) map.set(uid, user);
    }
    return map;
  }, [options, linkedById]);

  const selectedUsers = value
    .map((uid) => optionsById.get(uid))
    .filter((user): user is UserOption => Boolean(user));

  const activeOptions = options.filter((opt) => opt.active !== false);
  const search = normalizeSearch(query);
  const filteredOptions = activeOptions.filter((opt) => {
    if (!search) return true;
    return (
      normalizeSearch(opt.name).includes(search) ||
      normalizeSearch(opt.email).includes(search) ||
      normalizeSearch(opt.organizationAcronym ?? "").includes(search)
    );
  });

  const visibleChips = selectedUsers.slice(0, maxVisibleChips);
  const hiddenCount = Math.max(0, selectedUsers.length - visibleChips.length);

  function toggle(userId: string): void {
    if (value.includes(userId)) {
      onChange(value.filter((id) => id !== userId));
      return;
    }
    onChange([...value, userId]);
  }

  function remove(userId: string): void {
    onChange(value.filter((id) => id !== userId));
  }

  return (
    <div className={cn("min-w-[14rem]", className)}>
      {label ? (
        <label htmlFor={id} className="mb-0.5 block text-xs font-medium text-slate-600">
          {label}
        </label>
      ) : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            disabled={disabled}
            className={cn(
              formControlClass,
              "flex min-h-[2.5rem] items-center justify-between gap-2 px-2 py-1.5 text-left disabled:cursor-not-allowed"
            )}
            aria-expanded={open}
          >
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              {selectedUsers.length === 0 ? (
                <span className="text-sm text-muted-foreground">{placeholder}</span>
              ) : (
                <>
                  {visibleChips.map((user) => (
                    <span
                      key={user.id}
                      className="inline-flex max-w-full items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs text-slate-800"
                    >
                      <span className="truncate">{user.name}</span>
                      {!user.active ? (
                        <Badge variant="outline" className="px-1 py-0 text-[10px] font-normal text-amber-800">
                          Inativo
                        </Badge>
                      ) : null}
                      <span
                        role="button"
                        tabIndex={-1}
                        className="rounded p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          remove(user.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            remove(user.id);
                          }
                        }}
                        aria-label={`Remover ${user.name}`}
                      >
                        <X className="h-3 w-3" />
                      </span>
                    </span>
                  ))}
                  {hiddenCount > 0 ? (
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
                      +{hiddenCount}
                    </span>
                  ) : null}
                </>
              )}
            </div>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(24rem,calc(100vw-2rem))] p-2"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <input
            className={cn(formControlClass, "mb-2")}
            placeholder="Pesquisar por nome ou e-mail…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={disabled}
            autoFocus
          />
          <div className="max-h-64 space-y-0.5 overflow-y-auto">
            {isLoading ? <p className="px-2 py-1.5 text-xs text-muted-foreground">Carregando usuários…</p> : null}
            {!isLoading && filteredOptions.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum usuário encontrado.</p>
            ) : null}
            {filteredOptions.map((opt) => {
              const checked = value.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  className={cn(
                    "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                    checked && "bg-muted"
                  )}
                  onClick={() => toggle(opt.id)}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px]",
                      checked ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background"
                    )}
                    aria-hidden
                  >
                    {checked ? "✓" : ""}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">{opt.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{opt.email}</span>
                    {opt.organizationAcronym ? (
                      <span className="mt-0.5 block truncate text-[11px] text-slate-500">{opt.organizationAcronym}</span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
          {value.length > 0 ? (
            <button
              type="button"
              className="mt-2 w-full rounded-md px-2 py-1.5 text-left text-xs text-slate-600 hover:bg-muted"
              onClick={() => onChange([])}
            >
              Limpar seleção
            </button>
          ) : null}
        </PopoverContent>
      </Popover>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

type UserSelectProps = Omit<UserMultiSelectProps, "value" | "onChange" | "maxVisibleChips"> & {
  value: string;
  onChange: (id: string) => void;
};

/** Variante de seleção única sobre o mesmo componente. */
export function UserSelect({ value, onChange, ...rest }: UserSelectProps): JSX.Element {
  return (
    <UserMultiSelect
      {...rest}
      maxVisibleChips={1}
      value={value ? [value] : []}
      onChange={(ids) => onChange(ids[ids.length - 1] ?? "")}
    />
  );
}
