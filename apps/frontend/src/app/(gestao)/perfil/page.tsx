import { ProfileView } from "@/components/profile/profile-view";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function PerfilPage(): JSX.Element {
  return <ProfileView />;
}
