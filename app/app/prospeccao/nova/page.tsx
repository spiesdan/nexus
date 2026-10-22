import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";

import { traduzir } from "@/lib/i18n/dicionario";
import { CATEGORIAS_COMERCIAIS } from "@/lib/prospeccao/categorias";

import { NovaCampanha } from "./_nova";
import { SemPermissaoParaCriar } from "./_sem-permissao";

export const dynamic = "force-dynamic";

/**
 * A criação de campanha tem endereço próprio.
 *
 * Rota (e não modal) por três motivos concretos: sobrevive ao F5 no meio do
 * assistente, pode ser mandada por link para quem vai montar a campanha, e não
 * divide a tela com a lista de campanhas existentes.
 *
 * A permissão é a mesma da lista: criar campanha exige papel de atendente ou
 * superior. Sem isso a rota mostraria um formulário que a API recusaria no
 * clique final — recusar cedo e dizer por quê é mais honesto.
 */
export default async function NovaCampanhaPage() {
  const user = await requireAuth();
  const t = (texto: string) => traduzir(texto, user.idioma);
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const podeCriar =
    user.is_platform_admin || ROLE_RANK[activeOrg.role] >= ROLE_RANK.agent;

  if (!podeCriar) return <SemPermissaoParaCriar />;

  return <NovaCampanha categorias={CATEGORIAS_COMERCIAIS} />;
}
