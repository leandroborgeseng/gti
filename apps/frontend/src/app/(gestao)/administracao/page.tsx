import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { AdministracaoView } from "@/components/admin/administracao-view";
import { getAuthMe } from "@/lib/api";
import { safeLoadNullable } from "@/lib/api-load";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdministracaoPage(): Promise<JSX.Element> {
  const meRes = await safeLoadNullable(() => getAuthMe());
  if (meRes.error) {
    return (
      <Card className="space-y-4 p-6">
        <h1 className="text-lg font-semibold text-slate-900">Administração</h1>
        <DataLoadAlert messages={[meRes.error]} title="Não foi possível confirmar a sessão" />
        <p className="text-sm text-slate-600">Volte a entrar ou verifique a ligação para o servidor.</p>
      </Card>
    );
  }

  const me = meRes.data;
  if (!me || me.role !== "ADMIN") {
    return (
      <Card className="p-6">
        <h1 className="text-lg font-semibold text-slate-900">Administração</h1>
        <p className="mt-2 text-sm text-slate-600">
          Esta área é reservada a perfis <strong className="font-medium text-slate-800">ADMIN</strong>. Inicie sessão com
          uma conta de administrador ou peça acesso à equipa de suporte.
        </p>
      </Card>
    );
  }

  // Usuários carregam sob demanda na aba (UsersView) — evita SSR pesado no boot da Administração.
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando administração…</p>}>
      <AdministracaoView users={[]} />
    </Suspense>
  );
}
