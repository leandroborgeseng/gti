import Link from "next/link";
import { GlosaAttachments } from "@/components/glosas/glosa-attachments";
import { Card } from "@/components/ui/card";
import { getGlosa } from "@/lib/api";

const typeLabel: Record<string, string> = {
  ATRASO: "Atraso",
  NAO_ENTREGA: "Não entrega",
  SLA: "SLA",
  QUALIDADE: "Qualidade"
};

export default async function GlosaDetailPage({ params }: { params: { id: string } }): Promise<JSX.Element> {
  const glosa = await getGlosa(params.id).catch(() => null);
  if (!glosa) {
    return (
      <Card>
        <p className="text-sm text-slate-600">Glosa não encontrada.</p>
      </Card>
    );
  }
  const med = glosa.measurement;
  const medLabel =
    med != null
      ? `${String(med.referenceMonth).padStart(2, "0")}/${med.referenceYear}${med.contract?.name ? ` · ${med.contract.name}` : ""}`
      : glosa.measurementId;

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link href="/glosas" className="text-blue-700 underline hover:text-blue-900">
          Voltar à lista de glosas
        </Link>
      </p>
      <Card>
        <h3 className="mb-2 font-semibold">Glosa · {typeLabel[glosa.type] ?? glosa.type}</h3>
        <div className="grid gap-2 text-sm text-slate-700 md:grid-cols-2">
          <p>
            <strong>Medição:</strong> {medLabel}
          </p>
          <p>
            <strong>Valor:</strong> {glosa.value}
          </p>
          <p>
            <strong>Criado por:</strong> {glosa.createdBy}
          </p>
          <p>
            <strong>Data:</strong> {new Date(glosa.createdAt).toLocaleString("pt-BR")}
          </p>
        </div>
        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Justificativa</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{glosa.justification}</p>
        </div>
      </Card>
      <Card>
        <h4 className="mb-2 font-medium">Anexos</h4>
        <GlosaAttachments glosaId={glosa.id} attachments={glosa.attachments ?? []} />
      </Card>
    </div>
  );
}
