import { StatusPage } from "@/components/nexus-ui/feedback/StatusPage";
import { idiomaDaPagina } from "@/lib/i18n/idioma-da-pagina";

export default async function ForbiddenPage() {
  return <StatusPage variante="sem-permissao" idioma={await idiomaDaPagina()} />;
}
