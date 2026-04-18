import { Card } from "@/components/ui/card";
import { UsersView } from "@/components/users/users-view";
import { getAuthMe, getUsers } from "@/lib/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function UsersPage(): Promise<JSX.Element> {
  const me = await getAuthMe().catch(() => null);
  if (!me || me.role !== "ADMIN") {
    return (
      <Card className="p-6">
        <h1 className="text-lg font-semibold text-slate-900">Utilizadores</h1>
        <p className="mt-2 text-sm text-slate-600">
          Esta área é reservada a perfis <strong className="font-medium text-slate-800">ADMIN</strong>. Inicie sessão com uma
          conta de administrador ou peça acesso à equipa GTI.
        </p>
      </Card>
    );
  }

  const users = await getUsers().catch(() => []);
  return <UsersView users={users} />;
}
