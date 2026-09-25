import { StatusPage } from "@/components/nexus-ui/feedback/StatusPage";
import { idiomaDaPagina } from "@/lib/i18n/idioma-da-pagina";

export default async function NotFound() {
  return <StatusPage variante="nao-encontrada" idioma={await idiomaDaPagina()} />;
}
