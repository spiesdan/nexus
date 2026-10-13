/**
 * PATCH /api/v1/commercial-orders/[id]/itens — adicionar, remover, ajustar.
 *
 * ─── A REGRA DE STATUS MUDOU, E ESTE É O LUGAR DE MUDAR ────────────────────
 *
 * O contrato anterior recusava: *"só rascunho/em_analise"*. O dono pediu para
 * corrigir o pedido **depois de pronto**.
 *
 * A rota agora NÃO recusa — e devolve `avisos` describing o que a troca não
 * estorna (comissão apurada, expedição, NF emitida). A razão está em
 * `lib/comercial/patch-itens.ts`, e é a mesma aqui: a regra de negócio do que
 * fazer com um pedido já faturado **não está escrita neste repositório**, e
 * escrevê-la aqui seria inventar política fiscal e comercial.
 *
 * ─── POR QUE PATCH E NÃO ACRESCENTAR `itens` AO `pedidoPatchSchema` ─────────
 *
 * Mexer num campo é UPDATE de uma linha. Mexer no conjunto de itens é DELETE +
 * INSERT + recálculo de total, que só faz sentido atômico — e o `ajustar`
 * chega pelo **id** do item, que precisa sobreviver à operação.
 */
import { randomUUID } from "node:crypto";

import { type NextRequest } from "next/server";

import { ApiError } from "@/lib/api/types";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { aplicarPatchDeItens } from "@/lib/comercial/patch-itens";
import { logger } from "@/lib/logger";
import { itensPatchSchema } from "@/lib/schemas/pedidos";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

export const dynamic = "force-dynamic";

/** Status em que a troca muda a natureza do ato. Não impede — avisa. */
const STATUS_COMPROMETIDOS = ["aprovado", "expedido", "entregue", "faturado"] as const;

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "commercial_orders" });
  if (!authz.ok) return authz.response;
  const orgId = authz.org.orgId;

  const { id } = await ctx.params;
  // Sem esta checagem, um id não-UUID vai ao Postgres, que responde
  // `invalid input syntax for type uuid` — e a rota devolveria 500 para o que
  // é, na origem, um erro de quem chamou. 400 diz a verdade.
  if (!z.string().uuid().safeParse(id).success) {
    return fail("validation_failed", "id inválido.", 400, { requestId });
  }

  let bruto: unknown;
  try {
    bruto = await req.json();
  } catch {
    bruto = null;
  }

  const parsed = itensPatchSchema.safeParse(bruto);
  if (!parsed.success) {
    return fail("validation_failed", "Corpo de itens inválido.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  // Patch vazio é 422, e ANTES de tocar no banco: "não pediu nada" é erro de
  // quem chamou, não operação no-op que devolve 200 e faz a tela piscar.
  if (
    parsed.data.adicionar.length === 0 &&
    parsed.data.remover.length === 0 &&
    parsed.data.ajustar.length === 0
  ) {
    return fail("validation_failed", "O patch de itens está vazio.", 422, { requestId });
  }

  const admin = createAdminClient();

  const { data: antes, error: erroLeitura } = await admin
    .from("commercial_orders")
    .select("status, exige_nf, total_cents")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (erroLeitura) return fail("internal_error", "Erro ao ler o pedido.", 500, { requestId });
  if (!antes) return fail("not_found", "Pedido não encontrado.", 404, { requestId });

  const pedido = antes as { status: string; exige_nf: boolean };

  const resultado = await aplicarPatchDeItens(admin, {
    pedidoId: id,
    organizationId: orgId,
    patch: parsed.data,
    userId: authz.user.id,
    requestId,
  });

  if (!resultado.ok) {
    if (resultado.motivo === "nao_encontrado") {
      return fail("not_found", "Pedido não encontrado.", 404, { requestId });
    }
    if (resultado.motivo === "produto_desconhecido") {
      // A posição chega 0-based; a tela e a mensagem falam em 1-based, e a
      // diferença já produziu "item 0" numa tela de usuário.
      const item = (resultado.posicao ?? 0) + 1;
      return fail(
        "validation_failed",
        `O produto do item ${item} não existe no catálogo.`,
        422,
        { requestId, details: { itens: [`item ${item}: produto não encontrado`] } },
      );
    }
    // `remover`/`ajustar` com id que não é deste pedido é erro de quem
    // chamou. Devolver 200 aqui faria a tela dizer "2 itens removidos" tendo
    // removido 1 — ou 0.
    return fail("validation_failed", "Um dos itens não pertence a este pedido.", 422, { requestId });
  }

  const comprometido = (STATUS_COMPROMETIDOS as readonly string[]).includes(pedido.status);
  const avisos: string[] = [];
  if (comprometido) {
    avisos.push(
      `O pedido está "${pedido.status}" e os itens foram trocados. Comissão apurada, expedição e nota não foram estornadas.`,
    );
  }
  if (pedido.exige_nf) {
    avisos.push(
      "O pedido está marcado como exige NF. Se a nota já foi emitida, precisa ser cancelada e refeita com os itens novos.",
    );
  }

  logger.info("itens do pedido alterados", {
    pedidoId: id,
    ...resultado,
    requestId,
  });

  return ok(
    {
      adicionados: resultado.adicionados ?? 0,
      removidos: resultado.removidos ?? 0,
      ajustados: resultado.ajustados ?? 0,
      subtotal_cents: resultado.subtotal_cents,
      total_cents: resultado.total_cents,
      status: pedido.status,
      avisos,
    },
    { requestId },
  );
}
