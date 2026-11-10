/**
 * O FECHAMENTO DA CARGA — a montagem do fechamento a partir do banco.
 *
 * ═══ MOVIMENTO DE UM ROUTE PARA A LIB ═══════════════════════════════════
 *
 * A montagem (`montarFechamento`) e a leitura (`lerCarga`) saíram do route
 * `app/api/v1/shipments/[id]/fechamento/route.ts` e vieram para cá de propósito:
 * a MESMA montagem alimenta o GET (a tela), o PUT (a gravação) e agora o
 * `GET .../fechamento/pdf` (o documento impresso) — e a regra não pode morar
 * em três lugares. A tela, a API e o PDF recebem os MESMOS números.
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

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  avisosDoFechamento,
  contaDoCaixa,
  linhasCompletas,
  LINHAS_DO_CAIXA,
  type AvisoDoFechamento,
  type ChaveDaLinha,
  type ContaDoCaixa,
  type LinhaDoCaixa,
} from "./fechamento-carga";
import {
  aCobrarPorCondicao,
  resumoDoFechamento,
  type ParadaFechamento,
  type ResumoFechamento,
} from "./fechamento-expedicao-pdf";
import { createAdminClient } from "@/lib/supabase/admin";

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

interface CargoRow {
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
 * divergem por centavos no dia em que alguém mexer numa delas. O `GET
 * .../fechamento/pdf` (o documento impresso) monta pelo mesmo caminho.
 */
export async function montarFechamento(
  admin: SupabaseClient,
  orgId: string,
  carga: CargoRow,
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

/**
 * Lê a carga (sem fechamento) para o PUT montar o esperado e para o GET/PDF
 * avaliar o estado.
 */
export async function lerCarga(admin: SupabaseClient, orgId: string, id: string): Promise<CargoRow | null> {
  const { data, error } = await admin
    .from("shipments")
    .select("id, numero, placa, veiculo_tipo, motorista_nome, status")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as CargoRow;
}
