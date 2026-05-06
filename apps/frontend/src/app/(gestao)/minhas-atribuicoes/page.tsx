import type { Route } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { getMyAssignments, type MyAssignments } from "@/lib/api";
import { safeLoad } from "@/lib/api-load";
import { classifyStatus, isOverdueNotDoneUtc } from "@/lib/projects-task-status";
import {
  AssignmentRowCard,
  AssignmentSection,
  AssignmentSummaryStatLink,
  ListTruncationFooter,
  taskAssignmentFootnote
} from "./assignment-cards";
import { AssignmentsCriteriaNote } from "./assignments-criteria-note";
import { CompletedProjectTasksAccordion } from "./completed-project-tasks-accordion";
import { HideEmptyAssignmentsToolbar } from "./hide-empty-assignments-toolbar";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const emptyAssignments: MyAssignments = {
  user: { id: "", email: "" },
  totals: { contracts: 0, modules: 0, projects: 0, tasks: 0, governanceTickets: 0, glpiTickets: 0 },
  listLimits: {
    maxItemsPerList: 100,
    tasksTruncated: false,
    governanceTruncated: false,
    glpiTruncated: false
  },
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

function formatDateTimeShort(value?: string | null): string {
  if (!value?.trim()) return "—";
  const d = new Date(value.trim());
  if (Number.isNaN(d.getTime())) return value.trim();
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(d);
}

function partitionProjectTasks(tasks: MyAssignments["tasks"]): { pending: MyAssignments["tasks"]; completed: MyAssignments["tasks"] } {
  const pending = tasks.filter((t) => classifyStatus(t.status) !== "done");
  const completed = tasks.filter((t) => classifyStatus(t.status) === "done");
  return { pending, completed };
}

export default async function MyAssignmentsPage(): Promise<JSX.Element> {
  const { data, error } = await safeLoad(() => getMyAssignments(), emptyAssignments);
  const { pending: tasksPending, completed: tasksCompleted } = partitionProjectTasks(data.tasks);
  const LM = data.listLimits ?? emptyAssignments.listLimits;
  const tasksSectionEmpty = tasksPending.length === 0 && tasksCompleted.length === 0;

  return (
    <main id="conteudo-minhas-atribuicoes" className="space-y-6">
      {error ? <DataLoadAlert messages={[error]} /> : null}
      <header className="space-y-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Minhas atribuições</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Tudo que está ligado ao seu utilizador: chamados, tarefas, projetos, contratos, módulos de contrato e governança.
          </p>
          {data.user.fiscalProfile ? (
            <p className="text-xs text-muted-foreground">
              Perfil de fiscal/gestor vinculado: {data.user.fiscalProfile.name} · {data.user.fiscalProfile.email}
            </p>
          ) : (
            <p className="text-xs text-amber-700">
              Nenhum cadastro de fiscal/gestor está vinculado ao seu utilizador; contratos como fiscal ou gestor só aparecem após esse vínculo.{" "}
              <Link href="/perfil" className="font-medium text-amber-900 underline underline-offset-2 hover:text-foreground">
                Abrir meu perfil
              </Link>
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <HideEmptyAssignmentsToolbar />
          <AssignmentsCriteriaNote />
        </div>
      </header>

      <section id="resumo-atribuicoes" aria-label="Resumo por tipo de atribuição" className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <AssignmentSummaryStatLink anchor="lista-chamados-glpi">
          <Card className="p-4 transition-colors hover:bg-muted/40">
            <p className="text-xs text-muted-foreground">Chamados GLPI</p>
            <strong className="mt-1 block text-2xl">{data.totals.glpiTickets}</strong>
          </Card>
        </AssignmentSummaryStatLink>
        <AssignmentSummaryStatLink anchor="lista-tarefas-projetos">
          <Card className="p-4 transition-colors hover:bg-muted/40">
            <p className="text-xs text-muted-foreground">Tarefas de projeto</p>
            <strong className="mt-1 block text-2xl">{data.totals.tasks}</strong>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">Só pendentes (não concluídas)</p>
          </Card>
        </AssignmentSummaryStatLink>
        <AssignmentSummaryStatLink anchor="lista-projetos-supervisionados">
          <Card className="p-4 transition-colors hover:bg-muted/40">
            <p className="text-xs text-muted-foreground">Projetos</p>
            <strong className="mt-1 block text-2xl">{data.totals.projects}</strong>
          </Card>
        </AssignmentSummaryStatLink>
        <AssignmentSummaryStatLink anchor="lista-contratos">
          <Card className="p-4 transition-colors hover:bg-muted/40">
            <p className="text-xs text-muted-foreground">Contratos</p>
            <strong className="mt-1 block text-2xl">{data.totals.contracts}</strong>
          </Card>
        </AssignmentSummaryStatLink>
        <AssignmentSummaryStatLink anchor="lista-modulos">
          <Card className="p-4 transition-colors hover:bg-muted/40">
            <p className="text-xs text-muted-foreground">Módulos</p>
            <strong className="mt-1 block text-2xl">{data.totals.modules}</strong>
          </Card>
        </AssignmentSummaryStatLink>
        <AssignmentSummaryStatLink anchor="lista-governanca">
          <Card className="p-4 transition-colors hover:bg-muted/40">
            <p className="text-xs text-muted-foreground">Governança</p>
            <strong className="mt-1 block text-2xl">{data.totals.governanceTickets}</strong>
          </Card>
        </AssignmentSummaryStatLink>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <AssignmentSection
          sectionId="lista-chamados-glpi"
          title="Chamados GLPI atribuídos ou relacionados"
          count={data.glpiTickets.length}
          empty="Nenhum chamado relacionado encontrado."
          footer={<ListTruncationFooter truncated={LM.glpiTruncated} label="Chamados GLPI" maxItems={LM.maxItemsPerList} />}
        >
          <>
            {data.glpiTickets.map((ticket) => (
              <AssignmentRowCard
                key={ticket.glpiTicketId}
                pill={ticket.status || "Sem status"}
                pillTone={ticket.open ? "amber" : "green"}
                title={
                  <Link href={`/chamados?ticket=${ticket.glpiTicketId}` as Route} className="font-medium text-foreground underline-offset-4 hover:underline">
                    #{ticket.glpiTicketId} · {ticket.title || "Chamado sem título"}
                  </Link>
                }
                meta={`Técnico: ${ticket.assignedUserName || "—"} · Grupo: ${ticket.contractGroupName || "—"} · Atualizado em ${formatDateTimeShort(ticket.dateModification)}`}
              />
            ))}
          </>
        </AssignmentSection>

        <section id="lista-tarefas-projetos" data-assign-section-empty={tasksSectionEmpty ? "1" : undefined}>
          <Card className="p-5">
            <h2 className="text-base font-semibold text-foreground">Tarefas de projetos</h2>
            {tasksSectionEmpty ? (
              <p className="mt-3 text-sm text-muted-foreground">Nenhuma tarefa relacionada encontrada.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {tasksPending.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma tarefa pendente; abra a sanfona «Concluídas ({tasksCompleted.length})» para ver as finalizadas.
                  </p>
                ) : null}
                {tasksPending.length > 0 ? (
                  <div className="rounded-lg border border-border bg-muted/25 px-3 py-2.5">
                    <h3 className="text-sm font-semibold text-foreground">Não concluídas ({tasksPending.length})</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Tarefas ainda não marcadas como feitas ou concluídas no projeto.
                    </p>
                  </div>
                ) : null}
                {tasksPending.map((task) => {
                  const overdue = isOverdueNotDoneUtc(task.dueDate ?? null, task.status);
                  const foot = taskAssignmentFootnote(task);
                  return (
                    <AssignmentRowCard
                      key={task.id}
                      pill={task.status}
                      pillTone={overdue ? "amber" : "neutral"}
                      className={overdue ? "border-amber-400 bg-amber-50/45" : undefined}
                      title={
                        <Link
                          href={`/projetos/${task.project.id}#task-${task.id}` as Route}
                          className="font-medium text-foreground underline-offset-4 hover:underline"
                        >
                          {task.title}
                        </Link>
                      }
                      meta={`Projeto: ${task.project.name} · Grupo: ${task.group.name} · Prazo: ${formatDate(task.dueDate)}${overdue ? " · Prazo ultrapassado (UTC)" : ""}`}
                      extraBelowMeta={foot}
                    />
                  );
                })}
                {tasksCompleted.length > 0 ? (
                  <CompletedProjectTasksAccordion count={tasksCompleted.length}>
                    {tasksCompleted.map((task) => (
                      <AssignmentRowCard
                        key={task.id}
                        pill={task.status}
                        pillTone="green"
                        className="border-muted bg-muted/35 text-muted-foreground shadow-none"
                        title={
                          <Link
                            href={`/projetos/${task.project.id}#task-${task.id}` as Route}
                            className="font-medium text-foreground/85 underline-offset-4 hover:underline"
                          >
                            {task.title}
                          </Link>
                        }
                        meta={`Projeto: ${task.project.name} · Grupo: ${task.group.name} · Prazo: ${formatDate(task.dueDate)}`}
                        extraBelowMeta={taskAssignmentFootnote(task)}
                      />
                    ))}
                  </CompletedProjectTasksAccordion>
                ) : null}
              </div>
            )}
          </Card>
          <ListTruncationFooter truncated={LM.tasksTruncated} label="Tarefas de projetos" maxItems={LM.maxItemsPerList} />
        </section>

        <AssignmentSection
          sectionId="lista-projetos-supervisionados"
          title="Projetos supervisionados"
          count={data.projects.length}
          empty="Nenhum projeto supervisionado encontrado."
        >
          <>
            {data.projects.map((project) => (
              <AssignmentRowCard
                key={project.id}
                pill={project.status}
                pillTone={project.overdue > 0 ? "red" : "green"}
                title={
                  <Link href={`/projetos/${project.id}` as Route} className="font-medium text-foreground underline-offset-4 hover:underline">
                    {project.name}
                  </Link>
                }
                meta={`Início: ${formatDate(project.startDate)} · Fim planejado: ${formatDate(project.plannedEndDate)}`}
              />
            ))}
          </>
        </AssignmentSection>

        <AssignmentSection
          sectionId="lista-contratos"
          title="Contratos como fiscal ou gestor"
          count={data.contracts.length}
          empty="Nenhum contrato vinculado ao seu utilizador."
        >
          <>
            {data.contracts.map((contract) => (
              <AssignmentRowCard
                key={contract.id}
                pill={contract.status}
                title={
                  <Link href={`/contracts/${contract.id}` as Route} className="font-medium text-foreground underline-offset-4 hover:underline">
                    {contract.number} · {contract.name}
                  </Link>
                }
                meta={`Papel: ${contract.role} · Vigência até ${formatDate(contract.endDate)}`}
              />
            ))}
          </>
        </AssignmentSection>

        <AssignmentSection
          sectionId="lista-modulos"
          title="Módulos sob sua validação"
          count={data.modules.length}
          empty="Nenhum módulo contratual sob sua validação."
        >
          <>
            {data.modules.map((mod) => (
              <AssignmentRowCard
                key={mod.id}
                pill={mod.status}
                title={
                  <Link href={`/contracts/${mod.contract.id}` as Route} className="font-medium text-foreground underline-offset-4 hover:underline">
                    {mod.name}
                  </Link>
                }
                meta={`Contrato: ${mod.contract.number} · ${mod.contract.name} · Criticidade: ${mod.criticality}`}
              />
            ))}
          </>
        </AssignmentSection>

        <AssignmentSection
          sectionId="lista-governanca"
          title="Chamados de governança"
          count={data.governanceTickets.length}
          empty="Nenhum chamado de governança vinculado."
          footer={<ListTruncationFooter truncated={LM.governanceTruncated} label="Governança" maxItems={LM.maxItemsPerList} />}
        >
          <>
            {data.governanceTickets.map((ticket) => (
              <AssignmentRowCard
                key={ticket.id}
                pill={ticket.status}
                title={
                  <Link href={`/governance/tickets/${ticket.id}` as Route} className="font-medium text-foreground underline-offset-4 hover:underline">
                    Chamado {ticket.ticketId}
                  </Link>
                }
                meta={`Papel: ${ticket.role} · Contrato: ${ticket.contract.number} · SLA: ${formatDateTimeShort(ticket.slaDeadline)}`}
              />
            ))}
          </>
        </AssignmentSection>
      </div>
    </main>
  );
}
