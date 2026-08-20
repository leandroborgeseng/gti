import { ProfileView } from "@/components/profile/profile-view";

/** Dados de perfil vêm do client (`useAuthMe`); sem force-dynamic. */
export default function PerfilPage(): JSX.Element {
  return <ProfileView />;
}
