import { redirect } from "next/navigation";

export default function UsersPage(): never {
  redirect("/administracao?tab=usuarios");
}
