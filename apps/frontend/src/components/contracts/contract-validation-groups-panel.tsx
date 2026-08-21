"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  createContractValidationGroup,
  deleteContractValidationGroup,
  getContractValidationGroups,
  updateContractValidationGroup,
  type ContractValidationGroup
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InlineLoading } from "@/components/ui/inline-loading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UserMultiSelect } from "@/components/ui/user-multi-select";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

type Props = {
  contractId: string;
};

function formatMembers(group: ContractValidationGroup): string {
  const users = group.members ?? [];
  if (users.length === 0) return "Sem responsáveis";
  const names = users.map((u) => u.name || u.email);
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} +${names.length - 3}`;
}

export function ContractValidationGroupsPanel({ contractId }: Props): JSX.Element {
  const router = useRouter();
  const qc = useQueryClient();
  const groupsQuery = useQuery({
    queryKey: queryKeys.contractValidationGroups(contractId),
    queryFn: () => getContractValidationGroups(contractId)
  });
  const groups = groupsQuery.data ?? [];
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [memberUserIds, setMemberUserIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editMemberUserIds, setEditMemberUserIds] = useState<string[]>([]);
  const [editActive, setEditActive] = useState(true);

  const refreshGroups = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.contractValidationGroups(contractId) });
    router.refresh();
  };

  const createMut = useMutation({
    mutationFn: () =>
      createContractValidationGroup(contractId, {
        name: name.trim(),
        description: description.trim() || null,
        memberUserIds
      }),
    onSuccess: () => {
      toast.success("Grupo de validação criado.");
      setName("");
      setDescription("");
      setMemberUserIds([]);
      refreshGroups();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar o grupo.");
    }
  });

  const updateMut = useMutation({
    mutationFn: () => {
      if (!editingId) throw new Error("Grupo não selecionado.");
      return updateContractValidationGroup(contractId, editingId, {
        name: editName.trim(),
        description: editDescription.trim() || null,
        memberUserIds: editMemberUserIds,
        active: editActive
      });
    },
    onSuccess: () => {
      toast.success("Grupo de validação atualizado.");
      setEditingId(null);
      refreshGroups();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Não foi possível atualizar o grupo.");
    }
  });

  const deleteMut = useMutation({
    mutationFn: (groupId: string) => deleteContractValidationGroup(contractId, groupId),
    onSuccess: () => {
      toast.success("Grupo removido ou inativado.");
      refreshGroups();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Não foi possível remover o grupo.");
    }
  });

  function startEdit(group: ContractValidationGroup): void {
    setEditingId(group.id);
    setEditName(group.name);
    setEditDescription(group.description ?? "");
    setEditMemberUserIds(group.memberUserIds ?? group.members?.map((m) => m.id) ?? []);
    setEditActive(group.active);
  }

  const busy = createMut.isPending || updateMut.isPending || deleteMut.isPending;

  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold text-slate-900">Grupos de validação</h2>
      <p className="mt-1 text-sm text-slate-600">
        Defina os grupos cujos membros serão responsáveis pela validação das funcionalidades vinculadas. Os
        responsáveis podem ser de outros órgãos. Grupos com funcionalidades vinculadas não são excluídos: apenas
        inativados.
      </p>

      <div className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
        <p className="text-sm font-medium text-slate-800">Novo grupo</p>
        <div className="grid gap-3 md:grid-cols-2">
          <Label className="space-y-1 text-xs">
            <span>Nome</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} placeholder="Ex.: Validação núcleo" />
          </Label>
          <Label className="space-y-1 text-xs md:col-span-2">
            <span>Descrição (opcional)</span>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={busy}
              rows={2}
              placeholder="Escopo ou observações do grupo"
            />
          </Label>
        </div>
        <UserMultiSelect
          id="new-validation-group-members"
          label="Responsáveis pelo grupo de validação"
          value={memberUserIds}
          onChange={setMemberUserIds}
          disabled={busy}
          placeholder="Selecione um ou mais usuários"
          hint="Pode incluir usuários de outros órgãos."
        />
        <Button
          type="button"
          disabled={busy || !name.trim()}
          onClick={() => createMut.mutate()}
        >
          {createMut.isPending ? "Salvando…" : "Criar grupo"}
        </Button>
      </div>

      <ul className="mt-4 space-y-3">
        {groupsQuery.isPending ? (
          <li>
            <InlineLoading label="Carregando grupos…" />
          </li>
        ) : groupsQuery.isError ? (
          <li className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            Não foi possível carregar os grupos de validação.
          </li>
        ) : groups.length === 0 ? (
          <li className="text-sm text-slate-600">Nenhum grupo de validação cadastrado neste contrato.</li>
        ) : (
          groups.map((group) => {
            const isEditing = editingId === group.id;
            return (
              <li
                key={group.id}
                className={cn(
                  "rounded-lg border px-3 py-3",
                  group.active ? "border-slate-200 bg-white" : "border-amber-200 bg-amber-50/40"
                )}
              >
                {isEditing ? (
                  <div className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <Label className="space-y-1 text-xs">
                        <span>Nome</span>
                        <Input value={editName} onChange={(e) => setEditName(e.target.value)} disabled={busy} />
                      </Label>
                      <Label className="flex items-center gap-2 text-xs md:pt-6">
                        <input
                          type="checkbox"
                          checked={editActive}
                          onChange={(e) => setEditActive(e.target.checked)}
                          disabled={busy}
                        />
                        <span>Grupo ativo</span>
                      </Label>
                      <Label className="space-y-1 text-xs md:col-span-2">
                        <span>Descrição</span>
                        <Textarea
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          disabled={busy}
                          rows={2}
                        />
                      </Label>
                    </div>
                    <UserMultiSelect
                      id={`edit-validation-group-${group.id}`}
                      label="Responsáveis pelo grupo de validação"
                      value={editMemberUserIds}
                      onChange={setEditMemberUserIds}
                      linkedUsers={group.members}
                      disabled={busy}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" disabled={busy || !editName.trim()} onClick={() => updateMut.mutate()}>
                        Salvar
                      </Button>
                      <Button type="button" variant="ghost" disabled={busy} onClick={() => setEditingId(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-slate-900">{group.name}</p>
                        {!group.active ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                            Inativo
                          </span>
                        ) : null}
                        <span className="text-xs text-slate-500">
                          {(group.featuresCount ?? 0)} funcionalidade(s)
                        </span>
                      </div>
                      {group.description ? <p className="text-sm text-slate-600">{group.description}</p> : null}
                      <p className="text-sm text-slate-700">
                        <span className="font-medium">Responsáveis: </span>
                        {formatMembers(group)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => startEdit(group)}>
                        Editar
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          const linked = (group.featuresCount ?? 0) > 0;
                          const msg = linked
                            ? `O grupo «${group.name}» tem funcionalidades vinculadas e será apenas inativado. Continuar?`
                            : `Excluir definitivamente o grupo «${group.name}»?`;
                          if (!window.confirm(msg)) return;
                          deleteMut.mutate(group.id);
                        }}
                      >
                        {(group.featuresCount ?? 0) > 0 ? "Inativar" : "Excluir"}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })
        )}
      </ul>
    </Card>
  );
}
