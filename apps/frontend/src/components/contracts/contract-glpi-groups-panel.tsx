"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getGlpiAssignedGroupsCatalog, updateContract, type ContractGlpiGroup } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { ContractGlpiGroupsField, type GlpiGroupSelection } from "@/components/contracts/contract-glpi-groups-field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

function toSelection(groups: ContractGlpiGroup[]): GlpiGroupSelection[] {
  return groups.map((g) => ({
    glpiGroupId: g.glpiGroupId,
    glpiGroupName: g.glpiGroupName ?? undefined
  }));
}

type Props = {
  contractId: string;
  initialGroups: ContractGlpiGroup[];
};

export function ContractGlpiGroupsPanel({ contractId, initialGroups }: Props): JSX.Element {
  const qc = useQueryClient();
  const stableKey = useMemo(
    () => initialGroups.map((g) => g.glpiGroupId).sort((a, b) => a - b).join(","),
    [initialGroups]
  );
  const [selected, setSelected] = useState<GlpiGroupSelection[]>(() => toSelection(initialGroups));

  useEffect(() => {
    setSelected(toSelection(initialGroups));
  }, [contractId, stableKey, initialGroups]);

  const qCat = useQuery({
    queryKey: queryKeys.glpiAssignedGroups,
    queryFn: getGlpiAssignedGroupsCatalog
  });

  const mut = useMutation({
    mutationFn: () =>
      updateContract(contractId, {
        glpiGroups: selected.map((s) => ({
          glpiGroupId: s.glpiGroupId,
          ...(s.glpiGroupName ? { glpiGroupName: s.glpiGroupName } : {})
        }))
      }),
    onSuccess: () => {
      toast.success("Grupos GLPI guardados.");
      void qc.invalidateQueries({ queryKey: queryKeys.contracts });
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Não foi possível guardar os grupos.");
    }
  });

  const catalog = qCat.data ?? [];
  const dirty =
    selected.length !== initialGroups.length ||
    selected.some((s) => !initialGroups.some((g) => g.glpiGroupId === s.glpiGroupId)) ||
    initialGroups.some((g) => !selected.some((s) => s.glpiGroupId === g.glpiGroupId));

  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold text-slate-900">Grupos GLPI (trabalho atribuído)</h2>
      <p className="mt-1 text-sm text-slate-600">
        Marque um ou mais grupos na lista abaixo (vinda da <strong>API GLPI</strong> e complementada por grupos já
        observados nos chamados em cache). Os IDs coincidem com{" "}
        <code className="rounded bg-slate-100 px-1 text-xs">contractGroupId</code> nos chamados, para cruzar métricas
        de SLA por contrato.
      </p>
      {qCat.isError ? (
        <p className="mt-3 text-sm text-destructive">
          {qCat.error instanceof Error ? qCat.error.message : "Não foi possível carregar o catálogo de grupos."}
        </p>
      ) : null}
      <div className="mt-4">
        <ContractGlpiGroupsField
          catalog={catalog}
          value={selected}
          onChange={setSelected}
          disabled={qCat.isPending || mut.isPending}
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="button" disabled={!dirty || mut.isPending} onClick={() => mut.mutate()}>
          {mut.isPending ? "A guardar…" : "Guardar grupos"}
        </Button>
        {dirty ? (
          <Button type="button" variant="ghost" size="sm" disabled={mut.isPending} onClick={() => setSelected(toSelection(initialGroups))}>
            Repor
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
