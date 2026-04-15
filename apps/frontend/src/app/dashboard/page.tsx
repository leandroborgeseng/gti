import { Card } from "@/components/ui/card";
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, PieChart, Pie, Cell } from "recharts";

const kpis = [
  { label: "Total contratado", value: "R$ 12.450.000,00" },
  { label: "Total executado", value: "R$ 7.820.000,00" },
  { label: "Total glosado", value: "R$ 432.000,00" },
  { label: "Economia gerada", value: "R$ 4.198.000,00" },
  { label: "Percentual execução", value: "62,8%" },
  { label: "% chamados dentro do SLA", value: "78%" },
  { label: "% chamados fora do SLA", value: "22%" },
  { label: "Chamados escalados", value: "6" },
  { label: "Na controladoria", value: "3" },
  { label: "Metas planejadas", value: "8" },
  { label: "Metas em andamento", value: "1" },
  { label: "Metas concluídas", value: "0" }
];

const monthly = [
  { mes: "Jan", valor: 520000 },
  { mes: "Fev", valor: 610000 },
  { mes: "Mar", valor: 580000 },
  { mes: "Abr", valor: 670000 },
  { mes: "Mai", valor: 705000 }
];

const statusData = [
  { name: "Ativo", value: 18, color: "#16a34a" },
  { name: "Suspenso", value: 3, color: "#f59e0b" },
  { name: "Expirado", value: 4, color: "#dc2626" }
];

export default function DashboardPage(): JSX.Element {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <p className="text-xs uppercase tracking-wide text-slate-500">{kpi.label}</p>
            <p className="mt-2 text-xl font-bold">{kpi.value}</p>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-semibold">Evolução mensal de custos</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="valor" fill="#2563eb" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <h3 className="mb-3 font-semibold">Contratos por status</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" outerRadius={95}>
                  {statusData.map((s) => (
                    <Cell key={s.name} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </section>

      <Card>
        <h3 className="mb-3 font-semibold">Alertas</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>3 contratos vencem nos próximos 30 dias</li>
          <li>5 medições estão pendentes de aprovação</li>
          <li>2 contratos de software com baixa entrega (&lt; 40%)</li>
        </ul>
      </Card>
    </div>
  );
}
