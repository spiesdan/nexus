import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";

/**
 * O contexto comum das seis telas do Radar.
 *
 * Achou a organização, o papel e a base: as seis subtelas precisam da MESMA
 * guarda, e duplicar isso em seis `page.tsx` é como as permissões divergem sem
 * ninguém notar (foi o motivo de `_contexto.ts` existir na ficha da carga).
 *
 * O layout do segmento chama isto uma vez por abertura do Radar; navegar entre
 * as abas não refaz a conta.
 */
export async function contextoDoRadar() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  // A seção de prospecção tem as MESMAS ações da aba Empresas (fila e conversa
  // exigem agent+). Mesmo critério, uma fonte.
  const podeOperar = user.is_platform_admin || ROLE_RANK[activeOrg.role] >= ROLE_RANK.agent;

  // Base da recuperação (contagem saía da antiga /app/recuperacao): sem pedido
  // anterior a 60 dias não há o que medir, e a tela diz "sem base" em vez de
  // mostrar uma lista vazia que parece defeito.
  const supabase = await createClient();
  const corte = new Date(Date.now() - 60 * 86400000).toISOString();
  const { count } = await supabase
    .from("commercial_orders")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", activeOrg.orgId)
    .neq("status", "cancelado")
    .lt("created_at", corte);

  return {
    temBase: (count ?? 0) > 0,
    podeOperar,
    usuarioId: user.id,
  };
}

export type ContextoDoRadar = Awaited<ReturnType<typeof contextoDoRadar>>;
