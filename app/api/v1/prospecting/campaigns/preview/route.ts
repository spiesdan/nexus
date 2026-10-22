/**
 * POST /api/v1/prospecting/campaigns/preview — o público REAL antes de criar.
 *
 * ═══ O DEFEITO QUE ESTA ROTA CORRIGE ══════════════════════════════════════
 *
 * O assistente de campanha tinha um passo "Público" que mostrava estimativas
 * de MERCADO (empresas da cidade menos clientes), não as empresas da base. O
 * operador criava a campanha, clicava em "Ver público" num card efêmero e só
 * então descobria quem ia receber. Pior: a lista sumia ao fechar a tela, e o
 * controle pós-criação não existia.
 *
 * Esta rota não cria campanha, não reserva empresa e não envia nada. Ela roda
 * a MESMA função do disparo (`publicoDaBase`) com o recorte escolhido e devolve
 * as primeiras linhas + o resumo do que ficou de fora. A prévia é uma promessa
 * verificável: o que aparece aqui é o que o disparo vai encontrar.
 *
 * `limite` é 500 (o mesmo teto padrão do público). Se a base tiver mais, a
 * resposta diz `completa: false`/`linhas.length === limite` e a tela avisa; não
 * afirmamos "todas" quando lemos só uma janela.
 */
import { randomUUID } from "node:crypto";

import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";
import { indiceDeClientes } from "@/lib/prospeccao/ja-cadastrada";
import { idsReservadosPorOutras } from "@/lib/prospeccao/reserva-de-campanha";
import {
  LIMITE_PADRAO,
  publicoDaBase,
  resumoDaBase,
} from "@/lib/prospeccao/publico-da-base";
import { campanhaPreviewSchema } from "@/lib/schemas/prospeccao";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "prospecting_campaigns" });
  if (!authz.ok) return authz.response;

  const parsed = campanhaPreviewSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const admin = createAdminClient();
  try {
    // O índice de clientes é a leitura mais cara; só entra porque a prévia
    // promete o MESMO recorte do envio (cliente que a loja já atende sai).
    const clientes = await indiceDeClientes(admin, authz.org.orgId);
    // `null` = nenhuma campanha existente é a dona desta prévia; empresas já
    // reservadas por OUTRA campanha ficam fora, como ficariam no disparo.
    const reservados = await idsReservadosPorOutras(admin, authz.org.orgId, null);
    const resultado = await publicoDaBase(admin, {
      organizationId: authz.org.orgId,
      cidades: parsed.data.cidades,
      categorias: parsed.data.categorias,
      limite: LIMITE_PADRAO,
      clientes,
      reservados,
    });

    await audit({
      organizationId: authz.org.orgId,
      actorUserId: authz.user.id,
      action: "prospecting_campaigns.public_read",
      resourceType: "prospecting_campaigns",
      requestId,
      metadata: {
        preview: true,
        total: resultado.total,
        ja_clientes: resultado.ja_clientes.length,
        duplicadas: resultado.duplicadas,
        para_revisar: resultado.para_revisar.length,
        em_campanha: resultado.em_campanha,
        categoria_a_revisar: resultado.categoria_a_revisar,
        varridas: resultado.varridas,
        completa: resultado.completa,
      },
    });

    return ok(
      {
        base: true,
        total: resultado.total,
        linhas: resultado.linhas,
        resumo: resumoDaBase(resultado),
        limite: LIMITE_PADRAO,
        ja_clientes: resultado.ja_clientes,
        duplicadas: resultado.duplicadas,
        para_revisar: resultado.para_revisar,
        em_campanha: resultado.em_campanha,
        categoria_a_revisar: resultado.categoria_a_revisar,
        varridas: resultado.varridas,
        completa: resultado.completa,
      },
      { requestId },
    );
  } catch (e) {
    logger.error("[prospecting.campaigns.preview] falha ao calcular o público", {
      requestId,
      organization_id: authz.org.orgId,
      erro: e instanceof Error ? e.message : String(e),
    });
    return fail("internal_error", "Não foi possível calcular o público agora.", 500, {
      requestId,
    });
  }
}
