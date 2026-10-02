import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { MeuDiaClient } from "./_components/MeuDiaClient";

export const dynamic = "force-dynamic";

/**
 * Meu Dia (NEXUS §21) — a página que responde "o que preciso fazer agora?".
 *
 * Duas colunas no desktop: a linha do tempo do dia (tarefas minhas +
 * compromissos, agrupados em Atrasado → Hoje → Amanhã → Mais tarde) e a
 * coluna de contexto (mensagens, follow-ups, recomendações, atalhos).
 *
 * O servidor só resolve quem é (nome + id): a saudação e a data dependem do
 * RELÓGIO DE QUEM OLHA (fuso do navegador), então nascem no cliente depois do
 * mount — calcular em `page.tsx` seria o horário do contêiner, e o de uma VPS
 * raramente é o de quem está na tela. Sem sidebar (doutrina da dobra).
 */
export default async function MeuDiaPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  const primeiro = user.full_name?.trim().split(/\s+/)[0] ?? null;
  return <MeuDiaClient nome={primeiro} userId={user.id} />;
}
