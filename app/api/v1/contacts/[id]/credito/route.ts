/**
 * GET /api/v1/contacts/[id]/credito — a situação de crédito do cliente.
 *
 * Existe porque a TELA precisa da MESMA conta do gate do servidor. Antes ela
 * somava os pedidos que a lista devolvia (`GET /commercial-orders?contact_id=`,
 * limitada a 200 linhas): num cliente com mais de 200 pedidos, o "em aberto"
 * exibido era menor que o real e o aviso "este pedido passa do limite" ficava
 * mudo — o vendedor só descobria no 422, depois de montar o pedido inteiro.
 *
 * A regra continua morando num lugar só: `situacaoDeCredito`
 * (`lib/comercial/credito.ts`), a mesma função que `criarPedidoComercial`
 * chama. Esta rota é a porta de leitura dela.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { situacaoDeCredito } from "@/lib/comercial/credito";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "contacts_credito" });
  if (!authz.ok) return authz.response;

  const { id } = await ctx.params;
  if (!UUID.test(id)) {
    return fail("validation_failed", "Contato inválido.", 422, { requestId });
  }

  const supabase = await createClient();

  // O crédito é do contato DESTA organização. Sem esta checagem, um id de
  // outro tenant devolveria "sem limite, nada em aberto" — um 200 que parece
  // resposta e é ausência.
  const { data: contato, error } = await supabase
    .from("contacts")
    .select("id")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (error) {
    return fail("internal_error", "Erro ao ler o contato.", 500, { requestId });
  }
  if (!contato) {
    return fail("not_found", "Contato não encontrado.", 404, { requestId });
  }

  const situacao = await situacaoDeCredito(supabase, authz.org.orgId, id);
  return ok(
    {
      tem_limite: situacao.temLimite,
      limite_cents: situacao.limite_cents,
      em_aberto_cents: situacao.em_aberto_cents,
    },
    { requestId },
  );
}
