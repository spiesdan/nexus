import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { MeuDiaClient } from "./_components/MeuDiaClient";

export const dynamic = "force-dynamic";

/**
 * Meu Dia (NEXUS §21) — a página que responde "o que preciso fazer agora?".
 *
 * Tarefas pendentes + follow-ups ativos + recomendações do Brain, cada
 * bloco com fonte real própria. Sem sidebar (doutrina da dobra).
 */
export default async function MeuDiaPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  const idioma = user.idioma;
  const primeiro = user.full_name?.trim().split(/\s+/)[0] ?? null;
  return <MeuDiaClient nome={primeiro} saudacao={traduzir("Bom dia", idioma)} />;
}
