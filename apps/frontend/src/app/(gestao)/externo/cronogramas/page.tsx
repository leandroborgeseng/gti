import { Card } from "@/components/ui/card";

export default function ExternoCronogramasPage(): JSX.Element {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Cronogramas</h1>
        <p className="text-sm text-muted-foreground">
          Visualização dos cronogramas dos contratos autorizados. Abra o contrato correspondente para detalhes.
        </p>
      </div>
      <Card className="p-4 text-sm text-muted-foreground">
        Use <strong>Meus contratos</strong> para abrir a ficha e consultar a seção de cronogramas de cada vínculo
        autorizado. A listagem consolidada completa fica para uma próxima entrega.
      </Card>
    </div>
  );
}
