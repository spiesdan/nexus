/**
 * GET /api/v1/prospecting/campaigns/regiao/cidades — as cidades com clientes.
 *
 * A campanha por região não escolhe cidade num textarea: ela SELECIONA da lista
 * que existe de verdade na carteira. A pergunta é "onde eu já atendi?", e a
 * resposta cruza pedido não cancelado com `contacts.cidade` — o pedido não
 * guarda cidade (ver `lib/comercial/clientes-por-regiao.ts`).
 *
 * Só entra cidade com pelo menos UM cliente alcançável (telefone em E.164):
 * oferecer uma cidade que não pode receber mensagem é o caminho mais curto para
 * uma campanha vazia. A contagem é de CONTATOS, não de pedidos.
 *
 * Somente leitura; não reserva nem cria nada.
 */
import { randomUUID } from "node:crypto";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import {
  agruparPorCidade,
  listarClientesPorRegiao,
} from "@/lib/comercial/clientes-por-regiao";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "prospecting_campaigns" });
  if (!authz.ok) return authz.response;

  try {
    const clientes = await listarClientesPorRegiao(createAdminClient(), {
      organizationId: authz.org.orgId,
    });
    const alcancaveis = clientes.lista.filter((c) => c.telefone_e164 !== null);
    return ok(
      {
        cidades: agruparPorCidade(alcancaveis),
        clientes: alcancaveis.length,
        pedidos_lidos: clientes.pedidos_lidos,
        completa: clientes.completa,
      },
      { requestId },
    );
  } catch (e) {
    logger.error("[prospecting.campaigns.regiao.cidades] falha ao ler as cidades", {
      requestId,
      organization_id: authz.org.orgId,
      erro: e instanceof Error ? e.message : String(e),
    });
    return fail("internal_error", "Não foi possível carregar as cidades com clientes.", 500, {
      requestId,
    });
  }
}
