import Link from "next/link";
import { MeasurementDetailView } from "@/components/measurements/measurement-detail-view";
import { Card } from "@/components/ui/card";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { getMeasurement } from "@/lib/api";
import { safeLoadNullable } from "@/lib/api-load";
import { gestaoMayMutateAttachments } from "@/lib/session-role-server";

export default async function MeasurementDetailPage({ params }: { params: { id: string } }): Promise<JSX.Element> {
  const { data: measurement, error } = await safeLoadNullable(() => getMeasurement(params.id));
  if (error) {
    return (
      <div className="space-y-4">
        <DataLoadAlert messages={[error]} title="Não foi possível carregar a medição" />
        <p className="text-sm">
          <Link
            href="/measurements"
            className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 transition hover:decoration-slate-900"
          >
            Voltar à lista de medições
          </Link>
        </p>
      </div>
    );
  }
  if (!measurement) {
    return (
      <Card>
        <p className="text-sm text-slate-600">Medição não encontrada.</p>
      </Card>
    );
  }
  const mayMutateAnexos = await gestaoMayMutateAttachments();
  return <MeasurementDetailView initial={measurement} canMutateAttachments={mayMutateAnexos} />;
}
