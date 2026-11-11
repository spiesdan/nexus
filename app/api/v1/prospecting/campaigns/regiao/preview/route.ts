/**
 * POST /api/v1/prospecting/campaigns/regiao/preview
 *
 * A PRÉVIA da campanha por região: "quem já comprou nas cidades escolhidas?".
 * Não cria campanha, não reserva contato e não envia nada — é a mesma promessa
 * verificável da prévia da recuperação: o que aparece aqui é o que a criação vai
 * alcançar.
 *
 * A lista vem de `listarClientesPorRegiao`, a MESMA função do POST e da lista de
 * cidades. O que esta rota acrescenta é o cruzamento com as reservas: contato já
 * colocado em outra campanha não entra nesta (0277), e a tela precisa dizer
 * quantos ficaram de fora em vez de prometer um público que o POST vai recusar.
 */
import { randomUUID } from "node:crypto";

import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { listarClientesPorRegiao } from "@/lib/comercial/clientes-por-regiao";
import { logger } from "@/lib/logger";
import { idsReservadosPorOutras } from "@/lib/prospeccao/reserva-de-campanha";
import { regiaoPreviewSchema } from "@/lib/schemas/prospeccao";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "prospecting_campaigns" });
  if (!authz.ok) return authz.response;

  const parsed = regiaoPreviewSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Escolha ao menos uma cidade.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const admin = createAdminClient();
  try {
    // As duas leituras são independentes; em paralelo a prévia responde no
    // tempo de uma, não na soma das duas.
    const [clientes, reservados] = await Promise.all([
      listarClientesPorRegiao(admin, {
        organizationId: authz.org.orgId,
        cidades: parsed.data.cidades,
      }),
      idsReservadosPorOutras(admin, authz.org.orgId, null),
    ]);

    const linhas = clientes.lista.map((c) => {
      const emCampanha = reservados.has(c.contact_id);
      return {
        ...c,
        em_campanha: emCampanha,
        elegivel: c.telefone_e164 !== null && !emCampanha,
      };
    });

    const comTelefone = linhas.filter((l) => l.telefone_e164 !== null).length;
    const emCampanha = linhas.filter((l) => l.em_campanha).length;
    const elegiveis = linhas.filter((l) => l.elegivel).length;

    await audit({
      organizationId: authz.org.orgId,
      actorUserId: authz.user.id,
      action: "prospecting_campaigns.public_read",
      resourceType: "prospecting_campaigns",
      resourceId: null,
      requestId,
      metadata: {
        preview: true,
        publico: "contatos",
        regiao: true,
        cidades: parsed.data.cidades,
        total: linhas.length,
        com_telefone: comTelefone,
        em_campanha: emCampanha,
        elegiveis,
        pedidos_lidos: clientes.pedidos_lidos,
        completa: clientes.completa,
      },
    });

    return ok(
      {
        cidades: parsed.data.cidades,
        total: linhas.length,
        com_telefone: comTelefone,
        sem_telefone: linhas.length - comTelefone,
        em_campanha: emCampanha,
        elegiveis,
        pedidos_lidos: clientes.pedidos_lidos,
        completa: clientes.completa,
        resumo:
          `${linhas.length} ${linhas.length === 1 ? "cliente" : "clientes"} com pedido nas cidades escolhidas · ` +
          `${comTelefone} com WhatsApp · ` +
          `${elegiveis} ${elegiveis === 1 ? "pronto" : "prontos"} para receber`,
        linhas,
      },
      { requestId },
    );
  } catch (e) {
    logger.error("[prospecting.campaigns.regiao.preview] falha ao calcular a região", {
      requestId,
      organization_id: authz.org.orgId,
      erro: e instanceof Error ? e.message : String(e),
    });
    return fail("internal_error", "Não foi possível calcular os clientes da região agora.", 500, {
      requestId,
    });
  }
}
