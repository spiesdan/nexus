import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

import { BuscaClient } from "./_client";

export const dynamic = "force-dynamic";

/**
 * Busca global (§17 SHELL) — a página de resultados da paleta ⌘K.
 *
 * A paleta responde com 5 itens por seção porque é um launcher; aqui a mesma
 * pergunta (`lib/busca/global`, a MESMA fonte) responde com a lista inteira,
 * sem limite de descoberta. O termo chega por `?q=` — o Enter dentro da paleta
 * e o link "Ver todos os resultados" apontam para cá com o que o usuário já
 * digitou.
 */
export default async function BuscaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const { q } = await searchParams;
  return <BuscaClient q={q ?? ""} />;
}
