import { Card } from "@/components/ui/card";

export default function GlosasPage(): JSX.Element {
  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-2 font-semibold">Cadastro de glosas</h3>
        <p className="text-sm text-slate-600">Registre glosas por atraso, não entrega, SLA e qualidade.</p>
      </Card>
      <Card>
        <form className="grid gap-3 md:grid-cols-2">
          <input className="rounded-lg border border-border px-3 py-2" placeholder="ID da medição" />
          <select className="rounded-lg border border-border px-3 py-2">
            <option>ATRASO</option>
            <option>NAO_ENTREGA</option>
            <option>SLA</option>
            <option>QUALIDADE</option>
          </select>
          <input className="rounded-lg border border-border px-3 py-2" placeholder="Valor da glosa" />
          <input className="rounded-lg border border-border px-3 py-2" placeholder="Criado por" />
          <textarea className="md:col-span-2 rounded-lg border border-border px-3 py-2" placeholder="Justificativa" />
          <div className="md:col-span-2">
            <button className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white">Salvar glosa</button>
          </div>
        </form>
      </Card>
    </div>
  );
}
