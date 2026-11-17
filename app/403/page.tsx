import type { Metadata } from "next";
import { StatusPage } from "@/components/nexus-ui/feedback/StatusPage";
import { idiomaDaPagina } from "@/lib/i18n/idioma-da-pagina";

export const metadata: Metadata = { title: "Acesso negado" };

export default async function ForbiddenPage() {
  return <StatusPage variante="sem-permissao" idioma={await idiomaDaPagina()} />;
}
