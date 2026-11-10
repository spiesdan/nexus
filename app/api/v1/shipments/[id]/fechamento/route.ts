/**
 * GET/PUT /api/v1/shipments/[id]/fechamento — o fechamento de caixa da carga.
 *
 * ═══ DE ONDE ISTO VEIO ════════════════════════════════════════════════════
 *
 * O PDF de romaneio imprimia a conferência de caixa como OITO LINHAS VAZIAS
 * (dinheiro, PIX, cartão, cheques, boletos, −vale, −combustível, −despesas).
 * O papel era preenchido à mão, guardado num arquivo físico, e a diferença
 * era conferida de olho. A rota `/romaneio` agora imprime SÓ o romaneio; o
 * fechamento vive AQUI, no sistema.
 *
 * ═══ O QUE O PUT GRAVA, E O QUE ELE CALCULA ══════════════════════════════
 *
 * O corpo informa **o que foi contado** (`linhas`) e **o que foi conferido**
 * (`conferidos`). As somas (`entradas`, `saídas`, `líquido`, `diferença`) são
 * calculadas PELO SERVIDOR, nunca aceitas do corpo — o cliente informaria um
 * número que ele mesmo inventou, e a conferência é justamente o oposto de
 * aceitar o número de quem confere.
 *
 * O `esperado` (quanto deveria ter voltado) sai do resumo da carga, montado
 * aqui a partir do banco — mesma fonte que o romaneio lia.
 *
 * ═══ O QUE IMPEDE O FECHAMENTO ═══════════════════════════════════════════
 *
 * Só o que é verdade física: nenhuma parada conferida. Nesse caso o PUT
 * devolve 422 e NÃO grava — um fechamento sem conferência é uma declaração,
 * não um fechamento. Diferença diferente de zero é AVISO, não erro: acontece
 * no caixa todo dia, e o que não pode é passar sem ninguém ver.
 *
 * Regra de negócio que não está escrita — "quem pode fechar", "qual diferença
 * é aceitável" — NÃO é inventada aqui (ver AGENTS.md, "nunca invente regra").
 *
 * ═══ POR QUE `manager` NO PUT ════════════════════════════════════════════
 *
 * Fechar caixa é mexer em dinheiro. O gate é o canônico (`requireRole`), como
 * em toda rota que altera estado financeiro deste repositório — o mesmo nível
 * do `POST /conciliar`, que dá a baixa.
 */
import { randomUUID } from "node:crypto";

import { type NextRequest } from "next/server";
import { z } from "zod";

import { ApiError } from "@/lib/api/types";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { lerCarga, montarFechamento } from "@/lib/comercial/fechamento";
import {
  avisosDoFechamento,
  contaDoCaixa,
  linhasCompletas,
  LINHAS_DO_CAIXA,
  type ChaveDaLinha,
} from "@/lib/comercial/fechamento-carga";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const CHAVES = LINHAS_DO_CAIXA.map((l) => l.chave) as unknown as [
  ChaveDaLinha,
  ...ChaveDaLinha[],
];

const linhaSchema = z.object({
  chave: z.enum(CHAVES),
  valor_cents: z.number().int().min(0, "valor não pode ser negativo").max(1_000_000_000_000),
});

const putSchema = z
  .object({
    linhas: z.array(linhaSchema).max(8).default([]),
    /** Ids de `shipment_orders` — o ☐ de cada parada. */
    conferidos: z.array(z.string().uuid()).max(500).default([]),
    conferente_nome: z.string().trim().max(120).nullable().optional(),
    observacao: z.string().trim().max(2000).nullable().optional(),
  })
  // Chave repetida é erro de quem chamou, não soma silenciosa: somar duas
  // vezes o mesmo dinheiro faria o caixa "bater" por dupla contagem.
  .refine((b) => new Set(b.linhas.map((l) => l.chave)).size === b.linhas.length, {
    message: "Há linhas repetidas no caixa.",
  });

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "shipments" });
  if (!authz.ok) return authz.response;

  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) {
    return fail("validation_failed", "id inválido.", 400, { requestId });
  }

  const admin = createAdminClient();
  const carga = await lerCarga(admin, authz.org.orgId, id);
  if (!carga) return fail("not_found", "Carga não encontrada.", 404, { requestId });

  try {
    const payload = await montarFechamento(admin, authz.org.orgId, carga);
    return ok(payload, { requestId });
  } catch (e) {
    logger.error("fechamento: falha ao montar", {
      cargaId: id,
      erro: e instanceof Error ? e.message : String(e),
      requestId,
    });
    return fail("internal_error", "Erro ao montar o fechamento.", 500, { requestId });
  }
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  // Fechar caixa é mexer em dinheiro: o mesmo nível do POST /conciliar.
  const authz = await requireRole("manager", { requestId, resource: "shipments" });
  if (!authz.ok) return authz.response;
  const orgId = authz.org.orgId;

  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) {
    return fail("validation_failed", "id inválido.", 400, { requestId });
  }

  let corpo: unknown;
  try {
    corpo = putSchema.parse(await req.json());
  } catch (e) {
    if (e instanceof ApiError) {
      return fail(e.code, e.message, e.status, { requestId });
    }
    if (e instanceof z.ZodError) {
      return fail("validation_failed", "Dados do fechamento inválidos.", 422, {
        requestId,
        details: e.flatten().fieldErrors as Record<string, unknown>,
      });
    }
    throw e;
  }
  const entrada = corpo as z.infer<typeof putSchema>;

  const admin = createAdminClient();
  const carga = await lerCarga(admin, orgId, id);
  if (!carga) return fail("not_found", "Carga não encontrada.", 404, { requestId });

  const { data: itens } = await admin
    .from("shipment_orders")
    .select("id")
    .eq("shipment_id", id)
    .eq("organization_id", orgId);
  const idsDaCarga = new Set(((itens ?? []) as unknown as { id: string }[]).map((i) => i.id));
  const alheio = entrada.conferidos.find((c) => !idsDaCarga.has(c));
  if (alheio) {
    // Um id que não é parada DESTA carga é erro de quem chamou: silenciar
    // faria a tela dizer "5 paradas conferidas" tendo conferido 4.
    return fail("validation_failed", "Uma das paradas não pertence a esta carga.", 422, {
      requestId,
    });
  }

  let montado: Awaited<ReturnType<typeof montarFechamento>>;
  try {
    montado = await montarFechamento(admin, orgId, carga);
  } catch (e) {
    logger.error("fechamento: falha ao montar", {
      cargaId: id,
      erro: e instanceof Error ? e.message : String(e),
      requestId,
    });
    return fail("internal_error", "Erro ao montar o fechamento.", 500, { requestId });
  }

  // As somas saem do banco, nunca do corpo: o conferente informa o que contou.
  const conta = contaDoCaixa(entrada.linhas, montado.resumo.aCobrar);
  const avisos = avisosDoFechamento(conta, entrada.conferidos.length, montado.paradas.length);
  if (avisos.some((a) => a.nivel === "erro")) {
    return fail("validation_failed", "O fechamento não pode ser gravado.", 422, {
      requestId,
      details: { avisos: avisos.map((a) => a.texto) },
    });
  }

  const agora = new Date().toISOString();
  const { error: erroUpsert } = await admin.from("shipment_closings").upsert(
    {
      organization_id: orgId,
      shipment_id: id,
      linhas: linhasCompletas(entrada.linhas),
      entradas_cents: conta.entradas_cents,
      saidas_cents: conta.saidas_cents,
      liquido_cents: conta.liquido_cents,
      esperado_cents: conta.esperado_cents,
      diferenca_cents: conta.diferenca_cents,
      conferente_nome: entrada.conferente_nome?.trim() || null,
      conferente_user_id: authz.user.id,
      conferido_em: agora,
      observacao: entrada.observacao?.trim() || null,
      updated_at: agora,
    },
    { onConflict: "shipment_id" },
  );
  if (erroUpsert) {
    logger.error("fechamento: falha ao gravar", {
      cargaId: id,
      erro: erroUpsert.message,
      requestId,
    });
    return fail("internal_error", "Não foi possível gravar o fechamento.", 500, { requestId });
  }

  // O ☐ é substituído, não somado: o PUT carrega o estado inteiro da
  // conferência, e o que saiu da lista foi desconferido.
  const marcados = new Set(entrada.conferidos);
  if (marcados.size > 0) {
    const { error: erroMarca } = await admin
      .from("shipment_orders")
      .update({ conferido: true })
      .eq("shipment_id", id)
      .eq("organization_id", orgId)
      .in("id", [...marcados]);
    if (erroMarca) {
      logger.error("fechamento: falha ao marcar conferidos", {
        cargaId: id,
        erro: erroMarca.message,
        requestId,
      });
      return fail("internal_error", "Não foi possível gravar o fechamento.", 500, { requestId });
    }
  }
  {
    // `.not("id", "in", ...)` com lista vazia quebra a query; com lista cheia,
    // desmarca o resto. Sem marcados, desmarca tudo.
    let q = admin
      .from("shipment_orders")
      .update({ conferido: false })
      .eq("shipment_id", id)
      .eq("organization_id", orgId);
    if (marcados.size > 0) q = q.not("id", "in", `(${[...marcados].join(",")})`);
    const { error: erroDesmarca } = await q;
    if (erroDesmarca) {
      logger.error("fechamento: falha ao desmarcar", {
        cargaId: id,
        erro: erroDesmarca.message,
        requestId,
      });
      return fail("internal_error", "Não foi possível gravar o fechamento.", 500, { requestId });
    }
  }

  await audit({
    action: "shipment.fechamento_salvo",
    actorUserId: authz.user.id,
    organizationId: orgId,
    resourceType: "shipments",
    resourceId: id,
    requestId,
    metadata: {
      carga: carga.numero,
      conferidas: entrada.conferidos.length,
      paradas: montado.paradas.length,
      entradas_cents: conta.entradas_cents,
      saidas_cents: conta.saidas_cents,
      liquido_cents: conta.liquido_cents,
      esperado_cents: conta.esperado_cents,
      diferenca_cents: conta.diferenca_cents,
      bate: conta.bate,
    },
  });

  logger.info("fechamento da carga gravado", {
    cargaId: id,
    diferenca: conta.diferenca_cents,
    requestId,
  });

  return ok(
    {
      linhas: linhasCompletas(entrada.linhas),
      conta,
      conferidos: [...marcados],
      conferente_nome: entrada.conferente_nome?.trim() || null,
      conferido_em: agora,
      avisos,
    },
    { requestId },
  );
}
