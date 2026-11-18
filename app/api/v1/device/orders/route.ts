/**
 * POST /api/v1/device/orders — o dreno do shell offline, autenticado pelo
 * aparelho.
 *
 * ─── Por que rota própria, e não o mesmo handler do sistema ─────────────────
 *
 * `/api/v1/commercial-orders` autentica por cookie e resolve a organização do
 * vínculo da sessão. O shell não tem cookie — a organização aqui vem do TOKEN
 * do aparelho (fonte confiável), e o escopo é fechado. Uma porta só, com duas
 * autenticações, é o tipo de handler em que um dia alguém esquece qual das
 * duas fontes está valendo.
 *
 * ─── O que é igual ao sistema, de propósito ────────────────────────────────
 *
 * Toda a regra de negócio é a MESMA função (`criarPedidoComercial`): crédito,
 * estoque, tabela de preço, aprovação e numeração. E a idempotência é a mesma
 * `chave_sincronizacao` — o shell manda o UUID da fila, então timeout e retry
 * devolvem o pedido existente (`ja_existia`) em vez de duplicar.
 *
 * ─── O que o aparelho NÃO pode ─────────────────────────────────────────────
 *
 * `ignorar_estoque`/`ignorar_credito` são poder de `manager` na tela; aqui são
 * recusados sempre. O vendedor offline não negocia trava comercial pelo
 * celular, e aceitar o campo abriria a única porta de escalada da rota.
 *
 * ─── Service role aqui é seguro porque o filtro é explícito ────────────────
 *
 * `criarPedidoComercial` recebe o admin client nos dois parâmetros (o mesmo
 * que a tool de IA faz). Toda query do serviço filtra `organization_id` por
 * `ctx.orgId`, que veio do token — nunca do body. O teste de cross-tenant
 * (`tests/invariants/offline-devices-rls.test.ts`) cobre a credencial; a
 * fronteira do serviço é a mesma de qualquer outro chamador.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { autenticarDispositivo, ESCOPO_PEDIDOS, PAPEIS_QUE_CAPTURAM } from "@/lib/auth/device-token";
import { criarPedidoComercial } from "@/lib/comercial/criar-pedido";
import { pedidoCreateSchema } from "@/lib/schemas/pedidos";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  const auth = await autenticarDispositivo(req, ESCOPO_PEDIDOS);
  if (!auth.ok) return fail(auth.code, auth.message, auth.status, { requestId });
  const d = auth.dispositivo;

  // O papel é lido ao vivo; rebaixar a pessoa tira o poder do aparelho agora.
  if (!PAPEIS_QUE_CAPTURAM.has(d.role)) {
    return fail("forbidden_role", "Esta pessoa não pode criar pedidos.", 403, { requestId });
  }

  const parsed = pedidoCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }
  const entrada = parsed.data;

  if (entrada.ignorar_estoque || entrada.ignorar_credito) {
    return fail(
      "validation_failed",
      "Aparelho offline não ignora estoque nem crédito.",
      422,
      { requestId },
    );
  }

  const admin = createAdminClient();
  const resultado = await criarPedidoComercial(
    admin,
    admin,
    { orgId: d.organizationId, userId: d.userId, podeIgnorar: false },
    entrada,
  );

  if (!resultado.ok) {
    const status =
      resultado.code === "validation_failed" ? 422 : resultado.code === "conflict" ? 409 : 500;
    return fail(
      resultado.code === "conflict"
        ? "conflict"
        : resultado.code === "validation_failed"
          ? "validation_failed"
          : "internal_error",
      resultado.message,
      status,
      { requestId, ...(resultado.details ? { details: resultado.details } : {}) },
    );
  }

  // Replay: nada nasceu agora, então não há `created` para auditar (a mesma
  // regra da rota do sistema — auditar de novo mentiria que dois pedidos
  // nasceram).
  if (resultado.ja_existia) {
    return ok(
      {
        ...resultado.pedido,
        aprovacao_necessaria: resultado.aprovacao_necessaria,
        ja_existia: true,
      },
      { requestId, status: 200 },
    );
  }

  await audit({
    action: "commercial_order.created",
    actorUserId: d.userId,
    organizationId: d.organizationId,
    resourceType: "commercial_orders",
    resourceId: (resultado.pedido as { id: string }).id,
    requestId,
    metadata: { canal: "offline_device", device_id: d.id, device_nome: d.nome },
  });

  return ok(
    {
      ...resultado.pedido,
      aprovacao_necessaria: resultado.aprovacao_necessaria,
      ja_existia: false,
    },
    { requestId, status: 201 },
  );
}
