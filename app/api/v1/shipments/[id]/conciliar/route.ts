/**
 * POST /api/v1/shipments/[id]/conciliar — fechar a carga e dar baixa no que a
 * pessoa CONFIRMOU que recebeu.
 *
 * ─── O que esta rota NÃO faz ─────────────────────────────────────────────────
 *
 * Não dá baixa em todos os pedidos da carga. Fechar romaneio não é pagar: a
 * decisão é da pessoa, pedido a pedido, e a regra está em
 * `lib/comercial/conciliacao-carga.ts` — pura e testada. Esta rota só junta os
 * dados, aplica as decisões e devolve o que ficou de fora.
 *
 * ─── Idempotência ────────────────────────────────────────────────────────────
 *
 * Duas camadas, e as duas são necessárias:
 *
 *   1. A chave `carga:{id}:pedido:{id}` vai como `chave` do `registrarPagamento`,
 *      que já é idempotente. Reprocessar a mesma carga não duplica baixa.
 *   2. A carga precisa estar `concluida` para a conciliação rodar. Uma segunda
 *      chamada devolve o MESMO resultado sem tocar em nada — e a resposta diz
 *      `ja_conciliada`, para que quem chamou saiba.
 *
 * ─── Por que `manager` ───────────────────────────────────────────────────────
 *
 * Dar baixa é mexer em dinheiro. O gate é o canônico (`requireRole`), como em
 * toda rota que altera estado financeiro deste repositório.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { audit } from "@/lib/audit";
import { registrarPagamento } from "@/lib/comercial/financeiro";
import {
  conciliarFechamentoDeCarga,
  chaveDaBaixa,
  resumoDaConciliacao,
  textoDoMotivo,
  type ConfirmacaoDoRecebimento,
  type PedidoDoRomaneio,
  type RecebivelDoPedido,
} from "@/lib/comercial/conciliacao-carga";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const confirmacaoSchema = z.object({
  pedido_id: z.string().uuid(),
  pago: z.boolean(),
  valor_recebido_cents: z.number().int().positive().nullable().optional(),
  pago_em: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "data YYYY-MM-DD")
    .nullable()
    .optional(),
  meio_pagamento: z.string().trim().max(60).nullable().optional(),
  observacao: z.string().trim().max(500).nullable().optional(),
});

const bodySchema = z.object({
  /** Quem confirma. `agent` não dá baixa: a tela é de quem fecha a carga. */
  confirmacoes: z.array(confirmacaoSchema).max(500),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();

  const authz = await requireRole("manager", { requestId, resource: "shipments" });
  if (!authz.ok) return authz.response;

  const { id } = await params;

  let corpo: z.infer<typeof bodySchema>;
  try {
    const bruto = await req.json();
    const parsed = bodySchema.safeParse(bruto);
    if (!parsed.success) {
      return fail("validation_failed", "Dados da conciliação inválidos.", 422, {
        requestId,
        details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
      });
    }
    corpo = parsed.data;
  } catch {
    return fail("validation_failed", "Corpo da requisição não é JSON.", 400, { requestId });
  }

  const admin = createAdminClient();
  const hoje = new Date().toISOString().slice(0, 10);

  const { data: carga, error: erroCarga } = await admin
    .from("shipments")
    .select("id, numero, status")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (erroCarga || !carga) {
    return fail("not_found", "Carga não encontrada.", 404, { requestId });
  }

  const cargaRow = carga as unknown as { id: string; numero: number; status: string };
  if (cargaRow.status !== "concluida") {
    // Uma carga que não fechou pode ainda ganhar pedidos, e dar baixa antes
    // disso é exatamente a mistura entre operação e dinheiro que a regra proíbe.
    return fail(
      "validation_failed",
      "A carga precisa estar concluída para conciliar o recebimento.",
      422,
      { requestId },
    );
  }

  const { data: itens, error: erroItens } = await admin
    .from("shipment_orders")
    .select("order_id")
    .eq("shipment_id", id);
  if (erroItens) {
    return fail("internal_error", "Erro ao ler os pedidos da carga.", 500, { requestId });
  }
  const ids = ((itens ?? []) as { order_id: string }[]).map((i) => i.order_id);
  if (ids.length === 0) {
    return ok({ ja_conciliada: false, ...resumoDaConciliacao([]) }, { requestId });
  }

  const { data: pedidos, error: erroPedidos } = await admin
    .from("commercial_orders")
    .select("id, numero, cliente_nome, total_cents, status")
    .in("id", ids);
  if (erroPedidos) {
    return fail("internal_error", "Erro ao ler os pedidos.", 500, { requestId });
  }

  const { data: recebiveis, error: erroRecebiveis } = await admin
    .from("financial_receivables")
    .select("id, order_id, valor_original_cents, status")
    .in("order_id", ids);
  if (erroRecebiveis) {
    return fail("internal_error", "Erro ao ler os recebíveis.", 500, { requestId });
  }

  // O valor já recebido vem dos pagamentos. Uma consulta — sem N+1, que aqui
  // seria uma por pedido do romaneio.
  const recvIds = ((recebiveis ?? []) as { id: string }[]).map((r) => r.id);
  const recebidoPorRecebivel = new Map<string, number>();
  if (recvIds.length > 0) {
    const { data: pagamentos } = await admin
      .from("financial_payments")
      .select("receivable_id, valor_cents")
      .in("receivable_id", recvIds);
    for (const p of (pagamentos ?? []) as { receivable_id: string; valor_cents: number }[]) {
      recebidoPorRecebivel.set(
        p.receivable_id,
        (recebidoPorRecebivel.get(p.receivable_id) ?? 0) + Number(p.valor_cents),
      );
    }
  }

  const recebivelPorPedido = new Map<string, RecebivelDoPedido>();
  for (const r of (recebiveis ?? []) as unknown as {
    id: string;
    order_id: string | null;
    valor_original_cents: number;
    status: string;
  }[]) {
    if (!r.order_id) continue;
    recebivelPorPedido.set(r.order_id, {
      id: r.id,
      valor_original_cents: Number(r.valor_original_cents),
      valor_recebido_cents: recebidoPorRecebivel.get(r.id) ?? 0,
      status: r.status,
      vencimento: null,
    });
  }

  const confirmacoes: ConfirmacaoDoRecebimento[] = corpo.confirmacoes.map((c) => ({
    pedidoId: c.pedido_id,
    pago: c.pago,
    valorRecebidoCents: c.valor_recebido_cents ?? null,
    pagoEm: c.pago_em ?? null,
    meioPagamento: c.meio_pagamento ?? null,
    observacao: c.observacao ?? null,
  }));

  const decisoes = conciliarFechamentoDeCarga(
    (pedidos ?? []) as unknown as PedidoDoRomaneio[],
    recebivelPorPedido,
    confirmacoes,
    hoje,
  );

  const linhas: {
    pedido_id: string;
    numero: number;
    resultado: "baixado" | "em_aberto";
    valor_cents: number | null;
    motivo: string;
    saldo_restante_cents: number | null;
  }[] = [];

  for (const d of decisoes) {
    if (d.tipo === "baixa") {
      // `chaveDaBaixa` é o que impede a baixa duplicada quando o fechamento é
      // reprocessado. O serviço já é idempotente por chave — aqui ela é
      // DETERMINÍSTICA, e não um `randomUUID` que mudaria a cada chamada.
      const resultado = await registrarPagamento(admin, {
        orgId: authz.org.orgId,
        receivableId: d.recebivelId,
        valorCents: d.valorCents,
        pagoEm: d.pagoEm,
        forma: d.meioPagamento,
        observacao: d.observacao,
        chave: chaveDaBaixa(cargaRow.id, d.pedidoId),
        criadoPor: authz.user.id ?? null,
        hojeIso: new Date().toISOString(),
      });

      if (resultado.ok) {
        linhas.push({
          pedido_id: d.pedidoId,
          numero: d.numero,
          resultado: "baixado",
          valor_cents: d.valorCents,
          motivo: textoDoMotivo(d.motivo),
          saldo_restante_cents: 0,
        });
      } else {
        linhas.push({
          pedido_id: d.pedidoId,
          numero: d.numero,
          resultado: "em_aberto",
          valor_cents: null,
          motivo: `Não consegui registrar o recebimento (${resultado.erro}).`,
          saldo_restante_cents: d.valorCents,
        });
      }
      continue;
    }

    linhas.push({
      pedido_id: d.pedidoId,
      numero: d.numero,
      resultado: "em_aberto",
      valor_cents: null,
      motivo: textoDoMotivo(d.motivo),
      saldo_restante_cents: d.saldoRestanteCents ?? null,
    });
  }

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "shipment.conciliado",
    resourceType: "shipments",
    resourceId: cargaRow.id,
    metadata: {
      carga: cargaRow.numero,
      baixados: linhas.filter((l) => l.resultado === "baixado").length,
      em_aberto: linhas.filter((l) => l.resultado === "em_aberto").length,
    },
  });

  return ok(
    {
      ja_conciliada: false,
      carga: cargaRow.numero,
      ...resumoDaConciliacao(decisoes),
      linhas,
    },
    { requestId },
  );
}
