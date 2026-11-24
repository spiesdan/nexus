import { redirect } from "next/navigation";

import { PaginaDeConfiguracao } from "@/components/nexus-ui/layout/PaginaDeConfiguracao";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

import { CatalogoPdfClient } from "./_client";

export const dynamic = "force-dynamic";

/**
 * CATÁLOGO EM PDF — a porta da configuração (seleção/ordem/logo) e dos botões
 * de prévia/download. A prévia NÃO é mockup: a rota devolve o PDF real.
 */
export default async function CatalogoPdfPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  return (
    <PaginaDeConfiguracao
      titulo="Catálogo em PDF"
      descricao="Escolha os produtos, revise a ordem e baixe o catálogo. Nenhum preço entra no PDF."
    >
      <CatalogoPdfClient />
    </PaginaDeConfiguracao>
  );
}
