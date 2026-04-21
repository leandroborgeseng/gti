"use client";

import type { GlpiAssignedGroupOption } from "@/lib/api";

export type GlpiGroupSelection = { glpiGroupId: number; glpiGroupName?: string };

type Props = {
  catalog: GlpiAssignedGroupOption[];
  value: GlpiGroupSelection[];
  onChange: (next: GlpiGroupSelection[]) => void;
  disabled?: boolean;
};

export function ContractGlpiGroupsField({ catalog, value, onChange, disabled }: Props): JSX.Element {
  function toggle(row: GlpiAssignedGroupOption): void {
    const exists = value.some((v) => v.glpiGroupId === row.glpiGroupId);
    if (exists) {
      onChange(value.filter((v) => v.glpiGroupId !== row.glpiGroupId));
      return;
    }
    onChange([
      ...value,
      {
        glpiGroupId: row.glpiGroupId,
        glpiGroupName: row.glpiGroupName ?? undefined
      }
    ]);
  }

  if (catalog.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Não foi possível obter grupos da API GLPI nem dos chamados em cache. Confirme as variáveis{" "}
        <code className="rounded bg-muted px-1 text-xs">GLPI_*</code>, permissões do utilizador de serviço e se a API
        expõe o recurso de grupos (ex.: <code className="rounded bg-muted px-1 text-xs">/v2/Group</code>).
      </p>
    );
  }

  return (
    <ul className="max-h-60 list-none space-y-2 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3 sm:max-h-72">
      {catalog.map((row) => {
        const checked = value.some((v) => v.glpiGroupId === row.glpiGroupId);
        const label = row.glpiGroupName?.trim() || `Grupo #${row.glpiGroupId}`;
        return (
          <li key={row.glpiGroupId}>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-snug">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(row)}
              />
              <span>
                <span className="font-medium text-foreground">{label}</span>
                <span className="ml-1.5 tabular-nums text-xs text-muted-foreground">(id {row.glpiGroupId})</span>
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
