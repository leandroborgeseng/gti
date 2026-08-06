import { Card } from "@/components/ui/card";

export default function ExternoDocumentosPage(): JSX.Element {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Documentos</h1>
        <p className="text-sm text-muted-foreground">
          Documentos e notificações formalizadas dos contratos autorizados.
        </p>
      </div>
      <Card className="p-4 text-sm text-muted-foreground">
        As notificações enviadas estão em <strong>Notificações</strong>, com opção de impressão/HTML do documento
        assinado. Repositório documental ampliado fica para onda futura.
      </Card>
    </div>
  );
}
