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
import {
  avisosDoFechamento,
  contaDoCaixa,
  linhasCompletas,
  LINHAS_DO_CAIXA,
  type AvisoDoFechamento,
  type ChaveDaLinha,
  type ContaDoCaixa,
  type LinhaDoCaixa,
} from "@/lib/comercial/fechamento-carga";
import {
  aCobrarPorCondicao,
  resumoDoFechamento,
  type ParadaFechamento,
  type ResumoFechamento,
} from "@/lib/comercial/fechamento-expedicao-pdf";
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

export interface ParadaDoFechamento extends ParadaFechamento {
  shipment_order_id: string;
  order_id: string;
  a_cobrar_cents: number;
  conferido: boolean;
}

export interface FechamentoPayload {
  carga: {
    id: string;
    numero: number;
    placa: string | null;
    veiculo_tipo: string | null;
    motorista_nome: string | null;
    status: string;
  };
  resumo: ResumoFechamento;
  por_condicao: { condicao: string; valor_cents: number }[];
  paradas: ParadaDoFechamento[];
  fechamento: {
    linhas: LinhaDoCaixa[];
    conta: ContaDoCaixa;
    conferente_nome: string | null;
    conferido_em: string | null;
    observacao: string | null;
  } | null;
  avisos: AvisoDoFechamento[];
}

interface CargaRow {
  id: string;
  numero: number;
  placa: string | null;
  veiculo_tipo: string | null;
  motorista_nome: string | null;
  status: string;
}

interface ItemRow {
  id: string;
  order_id: string;
  sequencia: number;
  status: string;
  motivo: string | null;
  entregue_em: string | null;
  conferido: boolean;
}

/**
 * Monta o fechamento a partir do banco. Uma função só, chamada pelo GET e
 * pelo PUT, porque os dois precisam do MESMO esperado — e duas montagens
 * divergem por centavos no dia em que alguém mexer numa delas.
 */
async function montarFechamento(
  admin: SupabaseClient,
  orgId: string,
  carga: CargaRow,
): Promise<Omit<FechamentoPayload, "avisos"> & { avisos: AvisoDoFechamento[] }> {
  const { data: itens } = await admin
    .from("shipment_orders")
    .select("id, order_id, sequencia, status, motivo, entregue_em, conferido")
    .eq("shipment_id", carga.id)
    .eq("organization_id", orgId)
    .order("sequencia");

  const linhas = ((itens ?? []) as unknown as ItemRow[]).filter((i) => i.order_id);
  const ids = linhas.map((i) => i.order_id);

  const pedidos: Record<
    string,
    { numero: number; cliente_nome: string; total_cents: number; condicao_pagamento: string | null }
  > = {};
  const pagoPorPedido: Record<string, number> = {};
  const volumesPorPedido: Record<string, number> = {};
  if (ids.length > 0) {
    const [{ data }, { data: itensPedidos }, { data: recebiveis }] = await Promise.all([
      admin
        .from("commercial_orders")
        .select("id, numero, cliente_nome, total_cents, condicao_pagamento")
        .eq("organization_id", orgId)
        .in("id", ids),
      admin
        .from("commercial_order_items")
        .select("order_id, quantidade")
        .eq("organization_id", orgId)
        .in("order_id", ids),
      admin
        .from("financial_receivables")
        .select("order_id, valor_original_cents")
        .eq("organization_id", orgId)
        .in("order_id", ids)
        .eq("status", "pago"),
    ]);
    for (const p of ((data ?? []) as unknown as {
      id: string;
      numero: number;
      cliente_nome: string;
      total_cents: number;
      condicao_pagamento: string | null;
    }[])) {
      pedidos[p.id] = p;
    }
    for (const it of ((itensPedidos ?? []) as unknown as { order_id: string; quantidade: number }[])) {
      volumesPorPedido[it.order_id] = (volumesPorPedido[it.order_id] ?? 0) + (it.quantidade || 0);
    }
    for (const r of ((recebiveis ?? []) as unknown as {
      order_id: string;
      valor_original_cents: number;
    }[])) {
      pagoPorPedido[r.order_id] = (pagoPorPedido[r.order_id] ?? 0) + r.valor_original_cents;
    }
  }

  const paradas: ParadaDoFechamento[] = linhas.map((i) => {
    const ped = pedidos[i.order_id];
    const total = ped?.total_cents ?? 0;
    const pago = pagoPorPedido[i.order_id] ?? 0;
    return {
      shipment_order_id: i.id,
      order_id: i.order_id,
      sequencia: i.sequencia,
      numero: ped?.numero ?? 0,
      cliente_nome: ped?.cliente_nome ?? "—",
      endereco_entrega: null,
      total_cents: total,
      condicao: ped?.condicao_pagamento ?? null,
      situacao: i.status,
      motivo: i.motivo,
      entregue_em: i.entregue_em,
      volumes: volumesPorPedido[i.order_id] ?? 0,
      pago_cents: pago,
      a_cobrar_cents: i.status === "devolvido" ? 0 : Math.max(0, total - pago),
      conferido: i.conferido ?? false,
    };
  });

  const resumo = resumoDoFechamento(paradas);
  const porCondicao = aCobrarPorCondicao(paradas);

  const { data: salvo } = await admin
    .from("shipment_closings")
    .select("linhas, conferente_nome, conferido_em, observacao")
    .eq("shipment_id", carga.id)
    .eq("organization_id", orgId)
    .maybeSingle();

  const gravadas = (
    ((salvo as { linhas?: unknown } | null)?.linhas as unknown as LinhaDoCaixa[] | null) ?? []
  ).filter(
    (l): l is LinhaDoCaixa =>
      typeof l === "object" &&
      l !== null &&
      typeof (l as LinhaDoCaixa).chave === "string" &&
      typeof (l as LinhaDoCaixa).valor_cents === "number",
  );
  const conta = contaDoCaixa(gravadas, resumo.aCobrar);
  const conferidas = paradas.filter((p) => p.conferido).length;
  const avisos = avisosDoFechamento(conta, conferidas, paradas.length);

  return {
    carga: {
      id: carga.id,
      numero: carga.numero,
      placa: carga.placa,
      veiculo_tipo: carga.veiculo_tipo,
      motorista_nome: carga.motorista_nome,
      status: carga.status,
    },
    resumo,
    por_condicao: porCondicao,
    paradas,
    fechamento: salvo
      ? {
          linhas: linhasCompletas(gravadas),
          conta,
          conferente_nome: (salvo as { conferente_nome?: string | null }).conferente_nome ?? null,
          conferido_em: (salvo as { conferido_em?: string | null }).conferido_em ?? null,
          observacao: (salvo as { observacao?: string | null }).observacao ?? null,
        }
      : null,
    avisos,
  };
}

async function lerCarga(admin: SupabaseClient, orgId: string, id: string): Promise<CargaRow | null> {
  const { data, error } = await admin
    .from("shipments")
    .select("id, numero, placa, veiculo_tipo, motorista_nome, status")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as CargaRow;
}

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
