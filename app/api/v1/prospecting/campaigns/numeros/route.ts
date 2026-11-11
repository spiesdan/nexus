/**
 * GET /api/v1/prospecting/campaigns/numeros — os números que a campanha pode usar.
 *
 * A campanha por região deixa o operador ESCOLHER o número (0303). A tela
 * precisa de uma lista curta: rótulo e telefone, nunca nome de provider. Quem
 * decide se o número serve é a capability (`lib/prospeccao/numero-da-campanha`),
 * não uma comparação de string com "waha" — o canal oficial fica de fora porque
 * exige template, que é a resposta da matriz.
 *
 * Somente leitura. Número parado/arquivado nem aparece: seria uma opção que o
 * tick pausaria no primeiro minuto.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";
import type { TipoDaMensagem } from "@/lib/prospeccao/mensagem-da-campanha";
import { listarNumerosDaCampanha } from "@/lib/prospeccao/numero-da-campanha";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "prospecting_campaigns" });
  if (!authz.ok) return authz.response;

  const pedido = req.nextUrl.searchParams.get("tipo");
  const tipo: TipoDaMensagem = pedido === "template" ? "template" : "texto";

  try {
    const numeros = await listarNumerosDaCampanha(
      createAdminClient(),
      authz.org.orgId,
      tipo,
    );
    return ok({ tipo, numeros }, { requestId });
  } catch (e) {
    logger.error("[prospecting.campaigns.numeros] falha ao listar os números", {
      requestId,
      organization_id: authz.org.orgId,
      erro: e instanceof Error ? e.message : String(e),
    });
    return fail("internal_error", "Não foi possível carregar os números agora.", 500, {
      requestId,
    });
  }
}
