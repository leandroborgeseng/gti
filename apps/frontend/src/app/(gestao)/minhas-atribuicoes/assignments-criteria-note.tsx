"use client";

import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Explica como chamados e tarefas são associados ao utilizador (critérios do servidor). */
export function AssignmentsCriteriaNote(): JSX.Element {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-muted-foreground" aria-label="Como apareço nestas listas?">
          <Info className="h-4 w-4 shrink-0" aria-hidden />
          <span className="text-xs font-medium">Como apareço aqui?</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-w-md space-y-3 text-sm text-foreground" align="start">
        <p className="font-semibold leading-tight">Chamados GLPI</p>
        <p className="text-muted-foreground leading-relaxed">
          Incluem chamados em que o seu e-mail aparece como solicitante ou como texto parecido no campo de técnico/atribuído no cache, ou ainda quando o pedido combina com o nome ou e-mail do seu cadastro de fiscal/gestor vinculado (correspondência por texto, não sensível a maiúsculas).
        </p>
        <p className="font-semibold leading-tight">Tarefas de projetos</p>
        <p className="text-muted-foreground leading-relaxed">
          Entram se estiver como responsável principal na base (utilizador do sistema), nas responsabilidades PMF ligadas ao seu utilizador, ou quando o seu e-mail (ou parte antes do @), nome ou dados do fiscal aparecem nos campos de responsável interno ou externo da tarefa.
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Os limites de cada lista vêm do servidor; quando vir aviso de lista truncada, pode haver mais registos do que os mostrados.
        </p>
      </PopoverContent>
    </Popover>
  );
}
