import type { Route } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { getMyAssignments, type MyAssignments } from "@/lib/api";
import { safeLoad } from "@/lib/api-load";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const emptyAssignments: MyAssignments = {
  user: { id: "", email: "" },
  totals: { contracts: 0, modules: 0, projects: 0, tasks: 0, governanceTickets: 0, glpiTickets: 0 },
  contracts: [],
  modules: [],
  projects: [],
  tasks: [],
  governanceTickets: [],
  glpiTickets: []
};

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("pt-BR");
}

function StatusPill({ children, tone = "neutral" }: { children: string; tone?: "neutral" | "green" | "amber" | "red" }): JSX.Element {
  const cls =
    tone === "green"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : tone === "red"
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-border bg-muted/40 text-muted-foreground";
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

function Section({
  title,
  count,
  children,
  empty
}: {
  title: string;
  count: number;
  children: JSX.Element;
  empty: string;
}): JSX.Element {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{count}</span>
      </div>
      {count === 0 ? <p className="mt-3 text-sm text-muted-foreground">{empty}</p> : <div className="mt-4 space-y-3">{children}</div>}
    </Card>
  );
}

export default async function MyAssignmentsPage(): Promise<JSX.Element> {
  const { data, error } = await safeLoad(() => getMyAssignments(), emptyAssignments);

  return (
    <div className="space-y-6">
      {error ? <DataLoadAlert messages={[error]} /> : null}
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Minhas atribuições</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Tudo que está ligado ao seu usuário: chamados, tarefas, projetos, contratos, módulos de contrato e governança.
        </p>
        {data.user.fiscalProfile ? (
          <p className="text-xs text-muted-foreground">
            Perfil de fiscal/gestor vinculado: {data.user.fiscalProfile.name} · {data.user.fiscalProfile.email}
          </p>
        ) : (
          <p className="text-xs text-amber-700">
            Nenhum cadastro de fiscal/gestor está vinculado ao seu usuário; contratos como fiscal/gestor só aparecem após esse vínculo.
          </p>
        )}
      </header>

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Chamados GLPI</p><strong className="mt-1 block text-2xl">{data.totals.glpiTickets}</strong></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Tarefas</p><strong className="mt-1 block text-2xl">{data.totals.tasks}</strong></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Projetos</p><strong className="mt-1 block text-2xl">{data.totals.projects}</strong></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Contratos</p><strong className="mt-1 block text-2xl">{data.totals.contracts}</strong></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Módulos</p><strong className="mt-1 block text-2xl">{data.totals.modules}</strong></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Governança</p><strong className="mt-1 block text-2xl">{data.totals.governanceTickets}</strong></Card>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Chamados GLPI atribuídos ou relacionados" count={data.glpiTickets.length} empty="Nenhum chamado relacionado encontrado.">
          <>
            {data.glpiTickets.map((ticket) => (
              <div key={ticket.glpiTicketId} className="rounded-lg border bg-background p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link href={`/chamados?ticket=${ticket.glpiTicketId}` as Route} className="font-medium text-foreground underline-offset-4 hover:underline">
                    #{ticket.glpiTicketId} · {ticket.title || "Chamado sem título"}
                  </Link>
                  <StatusPill tone={ticket.open ? "amber" : "green"}>{ticket.status || "Sem status"}</StatusPill>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Técnico: {ticket.assignedUserName || "—"} · Grupo: {ticket.contractGroupName || "—"} · Atualizado em {ticket.dateModification || "—"}
                </p>
              </div>
            ))}
          </>
        </Section>

        <Section title="Tarefas de projetos" count={data.tasks.length} empty="Nenhuma tarefa relacionada encontrada.">
          <>
            {data.tasks.map((task) => (
              <div key={task.id} className="rounded-lg border bg-background p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link href={`/projetos/${task.project.id}` as Route} className="font-medium text-foreground underline-offset-4 hover:underline">
                    {task.title}
                  </Link>
                  <StatusPill>{task.status}</StatusPill>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Projeto: {task.project.name} · Grupo: {task.group.name} · Prazo: {formatDate(task.dueDate)}
                </p>
              </div>
            ))}
          </>
        </Section>

        <Section title="Projetos supervisionados" count={data.projects.length} empty="Nenhum projeto supervisionado encontrado.">
          <>
            {data.projects.map((project) => (
              <div key={project.id} className="rounded-lg border bg-background p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link href={`/projetos/${project.id}` as Route} className="font-medium text-foreground underline-offset-4 hover:underline">
                    {project.name}
                  </Link>
                  <StatusPill tone={project.overdue > 0 ? "red" : "green"}>{project.status}</StatusPill>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Início: {formatDate(project.startDate)} · Fim planejado: {formatDate(project.plannedEndDate)}
                </p>
              </div>
            ))}
          </>
        </Section>

        <Section title="Contratos como fiscal ou gestor" count={data.contracts.length} empty="Nenhum contrato vinculado ao seu usuário.">
          <>
            {data.contracts.map((contract) => (
              <div key={contract.id} className="rounded-lg border bg-background p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link href={`/contracts/${contract.id}` as Route} className="font-medium text-foreground underline-offset-4 hover:underline">
                    {contract.number} · {contract.name}
                  </Link>
                  <StatusPill>{contract.status}</StatusPill>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Papel: {contract.role} · Vigência até {formatDate(contract.endDate)}
                </p>
              </div>
            ))}
          </>
        </Section>

        <Section title="Módulos sob sua validação" count={data.modules.length} empty="Nenhum módulo contratual sob sua validação.">
          <>
            {data.modules.map((mod) => (
              <div key={mod.id} className="rounded-lg border bg-background p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link href={`/contracts/${mod.contract.id}` as Route} className="font-medium text-foreground underline-offset-4 hover:underline">
                    {mod.name}
                  </Link>
                  <StatusPill>{mod.status}</StatusPill>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Contrato: {mod.contract.number} · {mod.contract.name} · Criticidade: {mod.criticality}
                </p>
              </div>
            ))}
          </>
        </Section>

        <Section title="Chamados de governança" count={data.governanceTickets.length} empty="Nenhum chamado de governança vinculado.">
          <>
            {data.governanceTickets.map((ticket) => (
              <div key={ticket.id} className="rounded-lg border bg-background p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link href={`/governance/tickets/${ticket.id}` as Route} className="font-medium text-foreground underline-offset-4 hover:underline">
                    Chamado {ticket.ticketId}
                  </Link>
                  <StatusPill>{ticket.status}</StatusPill>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Papel: {ticket.role} · Contrato: {ticket.contract.number} · SLA: {formatDate(ticket.slaDeadline)}
                </p>
              </div>
            ))}
          </>
        </Section>
      </div>
    </div>
  );
}
