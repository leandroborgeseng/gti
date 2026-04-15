import { Card } from "@/components/ui/card";
import { GlosaForm } from "@/components/actions/glosa-form";
import { getGlosas } from "@/lib/api";

export default async function GlosasPage(): Promise<JSX.Element> {
  const glosas = await getGlosas().catch(() => []);
  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-2 font-semibold">Cadastro de glosas</h3>
        <p className="text-sm text-slate-600">Registre glosas por atraso, não entrega, SLA e qualidade.</p>
      </Card>
      <Card>
        <GlosaForm />
      </Card>
      <Card>
        <h4 className="mb-2 font-medium">Glosas registradas</h4>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-2">Medição</th>
                <th className="py-2">Tipo</th>
                <th className="py-2">Valor</th>
                <th className="py-2">Criado por</th>
                <th className="py-2">Data</th>
              </tr>
            </thead>
            <tbody>
              {glosas.map((glosa) => (
                <tr key={glosa.id} className="border-b">
                  <td className="py-2">{glosa.measurementId}</td>
                  <td className="py-2">{glosa.type}</td>
                  <td className="py-2">{glosa.value}</td>
                  <td className="py-2">{glosa.createdBy}</td>
                  <td className="py-2">{new Date(glosa.createdAt).toLocaleDateString("pt-BR")}</td>
                </tr>
              ))}
              {glosas.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-500">
                    Nenhuma glosa cadastrada.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
