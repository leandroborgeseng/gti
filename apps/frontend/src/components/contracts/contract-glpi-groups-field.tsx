"use client";

import { ChevronsUpDown, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { GlpiAssignedGroupOption } from "@/lib/api";
import { formControlClass } from "@/components/ui/form-primitives";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type GlpiGroupSelection = { glpiGroupId: number; glpiGroupName?: string };

type Props = {
  catalog: GlpiAssignedGroupOption[];
  value: GlpiGroupSelection[];
  onChange: (next: GlpiGroupSelection[]) => void;
  disabled?: boolean;
  loading?: boolean;
  loadError?: string | null;
  /** Quantidade de chips visíveis antes do resumo +N. */
  maxVisibleChips?: number;
  id?: string;
  placeholder?: string;
};

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function groupLabel(row: { glpiGroupId: number; glpiGroupName?: string | null }): string {
  const name = row.glpiGroupName?.trim();
  return name || `Grupo #${row.glpiGroupId}`;
}

/**
 * Multi-select discreto de grupos GLPI (somente catálogo), com pesquisa por nome,
 * chips compactos e indicação +N grupos.
 */
export function ContractGlpiGroupsField({
  catalog,
  value,
  onChange,
  disabled,
  loading,
  loadError,
  maxVisibleChips = 2,
  id = "glpi-groups",
  placeholder = "Pesquisar e selecionar grupos…"
}: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expandedChips, setExpandedChips] = useState(false);

  const catalogById = useMemo(() => {
    const map = new Map<number, GlpiAssignedGroupOption>();
    for (const row of catalog) {
      if (typeof row.glpiGroupId === "number") map.set(row.glpiGroupId, row);
    }
    return map;
  }, [catalog]);

  /** Selecionados resolvidos: preferem nome do catálogo; mantêm vínculo legado fora do catálogo. */
  const selectedResolved = useMemo(() => {
    return value.map((sel) => {
      const fromCat = catalogById.get(sel.glpiGroupId);
      return {
        glpiGroupId: sel.glpiGroupId,
        glpiGroupName: fromCat?.glpiGroupName ?? sel.glpiGroupName ?? null
      };
    });
  }, [value, catalogById]);

  const selectedIds = useMemo(() => new Set(value.map((v) => v.glpiGroupId)), [value]);

  const search = normalizeSearch(query);
  const filteredOptions = useMemo(() => {
    const rows = catalog.filter((row) => typeof row.glpiGroupId === "number");
    if (!search) return rows;
    return rows.filter((row) => {
      const name = normalizeSearch(row.glpiGroupName ?? "");
      const idStr = String(row.glpiGroupId);
      return name.includes(search) || idStr.includes(search);
    });
  }, [catalog, search]);

  const visibleChips = expandedChips
    ? selectedResolved
    : selectedResolved.slice(0, maxVisibleChips);
  const hiddenCount = Math.max(0, selectedResolved.length - visibleChips.length);

  function toggle(row: GlpiAssignedGroupOption): void {
    if (selectedIds.has(row.glpiGroupId)) {
      onChange(value.filter((v) => v.glpiGroupId !== row.glpiGroupId));
      return;
    }
    onChange([
      ...value,
      {
        glpiGroupId: row.glpiGroupId,
        glpiGroupName: row.glpiGroupName?.trim() || undefined
      }
    ]);
  }

  function remove(glpiGroupId: number): void {
    onChange(value.filter((v) => v.glpiGroupId !== glpiGroupId));
  }

  if (loadError) {
    return <p className="text-sm text-amber-800">{loadError}</p>;
  }

  if (!loading && catalog.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum grupo GLPI disponível no momento. Confirme a integração com a API GLPI e a sincronização dos chamados.
      </p>
    );
  }

  return (
    <div className="min-w-0">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            disabled={disabled || loading}
            className={cn(
              formControlClass,
              "flex min-h-[2.5rem] w-full items-center justify-between gap-2 px-2 py-1.5 text-left disabled:cursor-not-allowed"
            )}
            aria-expanded={open}
            aria-label="Grupos GLPI vinculados"
          >
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              {loading ? (
                <span className="text-sm text-muted-foreground">Carregando grupos…</span>
              ) : selectedResolved.length === 0 ? (
                <span className="text-sm text-muted-foreground">{placeholder}</span>
              ) : (
                <>
                  {visibleChips.map((row) => {
                    const label = groupLabel(row);
                    return (
                      <span
                        key={row.glpiGroupId}
                        className="inline-flex max-w-full items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs text-slate-800"
                        title={`${label} (id ${row.glpiGroupId})`}
                      >
                        <span className="truncate">{label}</span>
                        <span
                          role="button"
                          tabIndex={-1}
                          className="rounded p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            remove(row.glpiGroupId);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              remove(row.glpiGroupId);
                            }
                          }}
                          aria-label={`Remover ${label}`}
                        >
                          <X className="h-3 w-3" />
                        </span>
                      </span>
                    );
                  })}
                  {hiddenCount > 0 ? (
                    <span
                      role="button"
                      tabIndex={0}
                      className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
                      title={selectedResolved.map(groupLabel).join(", ")}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setExpandedChips(true);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          setExpandedChips(true);
                        }
                      }}
                    >
                      +{hiddenCount} grupo{hiddenCount === 1 ? "" : "s"}
                    </span>
                  ) : null}
                  {expandedChips && selectedResolved.length > maxVisibleChips ? (
                    <span
                      role="button"
                      tabIndex={0}
                      className="text-xs text-slate-500 underline-offset-2 hover:underline"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setExpandedChips(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          setExpandedChips(false);
                        }
                      }}
                    >
                      Recolher
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
          className="w-[min(28rem,calc(100vw-2rem))] p-2"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <input
            className={cn(formControlClass, "mb-2")}
            placeholder="Pesquisar pelo nome do grupo…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={disabled}
            autoFocus
          />
          <div className="max-h-64 space-y-0.5 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum grupo encontrado.</p>
            ) : null}
            {filteredOptions.map((opt) => {
              const checked = selectedIds.has(opt.glpiGroupId);
              const label = groupLabel(opt);
              return (
                <button
                  key={opt.glpiGroupId}
                  type="button"
                  className={cn(
                    "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                    checked && "bg-muted"
                  )}
                  onClick={() => toggle(opt)}
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
                    <span className="block truncate font-medium text-foreground">{label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      Identificador GLPI: {opt.glpiGroupId}
                    </span>
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
    </div>
  );
}

/** Resumo compacto de nomes de grupos para cabeçalho/listagens. */
export function formatGlpiGroupsSummary(
  groups: Array<{ glpiGroupId: number; glpiGroupName?: string | null }>,
  maxVisible = 3
): { text: string; full: string; hiddenCount: number } {
  if (!groups.length) {
    return { text: "-", full: "-", hiddenCount: 0 };
  }
  const names = groups.map(groupLabel);
  const full = names.join(", ");
  if (names.length <= maxVisible) {
    return { text: full, full, hiddenCount: 0 };
  }
  const visible = names.slice(0, maxVisible).join(", ");
  const hiddenCount = names.length - maxVisible;
  return {
    text: `${visible} +${hiddenCount} grupo${hiddenCount === 1 ? "" : "s"}`,
    full,
    hiddenCount
  };
}
