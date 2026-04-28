"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getAuthMe, updateMyProfile, USER_PROFILE_COLORS, type AuthMe } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function displayName(user: AuthMe | undefined): string {
  return user?.displayName?.trim() || user?.email || "Usuário";
}

export function ProfileView(): JSX.Element {
  const qc = useQueryClient();
  const { data: me, isLoading } = useQuery({
    queryKey: queryKeys.authMe,
    queryFn: getAuthMe
  });
  const [name, setName] = useState("");
  const [color, setColor] = useState(USER_PROFILE_COLORS[0]);

  useEffect(() => {
    if (!me) return;
    setName(me.displayName ?? "");
    setColor((me.profileColor as typeof USER_PROFILE_COLORS[number] | undefined) ?? USER_PROFILE_COLORS[0]);
  }, [me]);

  const previewName = useMemo(() => name.trim() || me?.email || "Usuário", [me?.email, name]);

  const mutation = useMutation({
    mutationFn: () => updateMyProfile({ displayName: name.trim() || null, profileColor: color }),
    onSuccess: () => {
      toast.success("Perfil atualizado.");
      void qc.invalidateQueries({ queryKey: queryKeys.authMe });
      void qc.invalidateQueries({ queryKey: queryKeys.projectSupervisors });
      void qc.invalidateQueries({ queryKey: [...queryKeys.projectsAllTasksRoot] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Não foi possível atualizar o perfil.");
    }
  });

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <Card className="max-w-2xl space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">Meu perfil</h1>
        <p className="text-sm text-muted-foreground">
          Defina o nome e a cor que aparecerão nas tarefas, projetos e demais áreas que exibem pessoas.
        </p>
      </div>

      <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm"
          style={{ backgroundColor: color }}
        >
          {initials(previewName)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{previewName}</p>
          <p className="truncate text-xs text-muted-foreground">{me?.email}</p>
        </div>
      </div>

      <form className="space-y-5" onSubmit={submit}>
        <label className="block space-y-2 text-sm font-medium">
          <span>Nome que aparece no sistema</span>
          <Input
            value={name}
            maxLength={80}
            placeholder={isLoading ? "Carregando..." : displayName(me)}
            disabled={mutation.isPending}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <div className="space-y-2">
          <p className="text-sm font-medium">Cor do nome</p>
          <div className="flex flex-wrap gap-2">
            {USER_PROFILE_COLORS.map((option) => (
              <button
                key={option}
                type="button"
                className={cn(
                  "h-9 w-9 rounded-full border-2 border-transparent shadow-sm ring-1 ring-black/10 transition hover:scale-105",
                  color === option && "border-foreground"
                )}
                style={{ backgroundColor: option }}
                aria-label={`Selecionar cor ${option}`}
                disabled={mutation.isPending}
                onClick={() => setColor(option)}
              />
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={mutation.isPending || isLoading}>
            {mutation.isPending ? "Salvando..." : "Salvar perfil"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
