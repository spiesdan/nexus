/**
 * POST /api/v1/prospecting/campaigns/recuperacao/preview
 *
 * A PRÉVIA da audiência de uma campanha de recuperação: "quem comprava e parou
 * há pelo menos X dias". Ela não cria campanha, não reserva contato e não envia
 * nada — é a mesma promessa verificável da prévia da base (`/campaigns/preview`):
 * o que aparece aqui é o que a campanha vai alcançar.
 *
 * A lista vem de `lib/comercial/inativos.ts`, a MESMA função do Radar. O que
 * esta rota acrescenta é o cruzamento com as reservas: contato já colocado em
 * outra campanha não pode entrar nesta (0277) e a tela precisa dizer quantos
 * ficaram de fora, em vez de prometer uma lista que o POST vai recusar.
 */
import { randomUUID } from "node:crypto";

import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { listarInativos } from "@/lib/comercial/inativos";
import { normalizaTelefone } from "@/lib/contacts/csv";
import { logger } from "@/lib/logger";
import { idsReservadosPorOutras } from "@/lib/prospeccao/reserva-de-campanha";
import { inativosPreviewSchema } from "@/lib/schemas/prospeccao";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** O mesmo formato que o motor exige de `escolherContato` (E.164). */
const TELEFONE_VALIDO = /^\+\d{8,15}$/;

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "prospecting_campaigns" });
  if (!authz.ok) return authz.response;

  const parsed = inativosPreviewSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Informe há quantos dias o cliente não compra.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const admin = createAdminClient();
  try {
    // As duas leituras são independentes; em paralelo a prévia responde no
    // tempo de uma, não na soma das duas.
    const [inativos, reservados] = await Promise.all([
      listarInativos(admin, {
        organizationId: authz.org.orgId,
        dias: parsed.data.dias_sem_compra,
      }),
      idsReservadosPorOutras(admin, authz.org.orgId, null),
    ]);

    const linhas = inativos.lista.map((c) => {
      // A MESMA normalização do motor (`normalizaTelefone`): uma linha antiga
      // gravada como "(49) 99999-8888" recebe no tick, então a prévia não pode
      // marcá-la como "sem WhatsApp" só porque não está em E.164.
      const normalizado = c.telefone ? normalizaTelefone(c.telefone) : null;
      const comTelefone = normalizado !== null && TELEFONE_VALIDO.test(normalizado);
      const emCampanha = reservados.has(c.contact_id);
      return {
        ...c,
        com_telefone: comTelefone,
        em_campanha: emCampanha,
        elegivel: comTelefone && !emCampanha,
      };
    });

    const comTelefone = linhas.filter((l) => l.com_telefone).length;
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
        dias_sem_compra: parsed.data.dias_sem_compra,
        total: linhas.length,
        com_telefone: comTelefone,
        em_campanha: emCampanha,
        elegiveis,
        varridos: inativos.varridos,
        completa: inativos.completa,
      },
    });

    return ok(
      {
        dias_sem_compra: parsed.data.dias_sem_compra,
        total: linhas.length,
        com_telefone: comTelefone,
        sem_telefone: linhas.length - comTelefone,
        em_campanha: emCampanha,
        elegiveis,
        varridos: inativos.varridos,
        completa: inativos.completa,
        resumo:
          `${linhas.length} ${linhas.length === 1 ? "cliente" : "clientes"} sem compra há ` +
          `${parsed.data.dias_sem_compra} dias · ${comTelefone} com WhatsApp · ` +
          `${elegiveis} ${elegiveis === 1 ? "pronto" : "prontos"} para receber`,
        linhas,
      },
      { requestId },
    );
  } catch (e) {
    logger.error("[prospecting.campaigns.recuperacao.preview] falha ao calcular os inativos", {
      requestId,
      organization_id: authz.org.orgId,
      erro: e instanceof Error ? e.message : String(e),
    });
    return fail("internal_error", "Não foi possível calcular os clientes inativos agora.", 500, {
      requestId,
    });
  }
}
