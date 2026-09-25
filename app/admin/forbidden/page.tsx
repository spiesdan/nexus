import { StatusPage } from "@/components/nexus-ui/feedback/StatusPage";
import { idiomaDaPagina } from "@/lib/i18n/idioma-da-pagina";

export const metadata = { title: "Acesso negado — Admin Plataforma" };

export default async function AdminForbiddenPage() {
  // Página sem `requirePlatformAdmin()` (é o próprio destino do redirect dele).
  // Quem chega aqui está autenticado (o guard já mandou quem não está para
  // `/login`), então `getUser()` sempre tem alguém.
  return <StatusPage variante="acesso-negado-admin" idioma={await idiomaDaPagina()} />;
}
