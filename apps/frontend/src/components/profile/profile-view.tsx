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

export function ProfileView(): JSX.Element {
  const qc = useQueryClient();
  const { data: me, isLoading } = useQuery({
    queryKey: queryKeys.authMe,
    queryFn: getAuthMe
  });
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [phone, setPhone] = useState("");
  const [color, setColor] = useState(USER_PROFILE_COLORS[0]);

  useEffect(() => {
    if (!me) return;
    setFirstName(me.firstName ?? me.displayName?.split(/\s+/)[0] ?? "");
    setLastName(me.lastName ?? me.displayName?.split(/\s+/).slice(1).join(" ") ?? "");
    setJobTitle(me.jobTitle ?? "");
    setDepartment(me.department ?? "");
    setPhone(me.phone ?? "");
    setColor((me.profileColor as typeof USER_PROFILE_COLORS[number] | undefined) ?? USER_PROFILE_COLORS[0]);
  }, [me]);

  const previewName = useMemo(() => [firstName, lastName].map((part) => part.trim()).filter(Boolean).join(" ") || me?.email || "Usuário", [firstName, lastName, me?.email]);

  const mutation = useMutation({
    mutationFn: () =>
      updateMyProfile({
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        jobTitle: jobTitle.trim() || null,
        department: department.trim() || null,
        phone: phone.trim() || null,
        profileColor: color
      }),
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
          Defina nome, sobrenome, dados de contato e a cor que aparecerão nas tarefas, projetos e demais áreas que exibem pessoas.
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
          <p className="truncate text-xs text-muted-foreground">
            {[jobTitle, department].map((part) => part.trim()).filter(Boolean).join(" · ") || me?.email}
          </p>
        </div>
      </div>

      <form className="space-y-5" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-2 text-sm font-medium">
            <span>Nome</span>
            <Input
              value={firstName}
              maxLength={40}
              placeholder={isLoading ? "Carregando..." : "Nome"}
              disabled={mutation.isPending}
              onChange={(event) => setFirstName(event.target.value)}
            />
          </label>
          <label className="block space-y-2 text-sm font-medium">
            <span>Sobrenome</span>
            <Input
              value={lastName}
              maxLength={60}
              placeholder={isLoading ? "Carregando..." : "Sobrenome"}
              disabled={mutation.isPending}
              onChange={(event) => setLastName(event.target.value)}
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-2 text-sm font-medium">
            <span>Cargo/Função</span>
            <Input
              value={jobTitle}
              maxLength={80}
              placeholder="Ex.: Analista de sistemas"
              disabled={mutation.isPending}
              onChange={(event) => setJobTitle(event.target.value)}
            />
          </label>
          <label className="block space-y-2 text-sm font-medium">
            <span>Setor/Unidade</span>
            <Input
              value={department}
              maxLength={80}
              placeholder="Ex.: GTI"
              disabled={mutation.isPending}
              onChange={(event) => setDepartment(event.target.value)}
            />
          </label>
          <label className="block space-y-2 text-sm font-medium sm:col-span-2">
            <span>Telefone/Ramal</span>
            <Input
              value={phone}
              maxLength={40}
              placeholder="Ex.: (00) 0000-0000 / ramal 123"
              disabled={mutation.isPending}
              onChange={(event) => setPhone(event.target.value)}
            />
          </label>
        </div>

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
