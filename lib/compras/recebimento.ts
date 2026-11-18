import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * O recebimento de compra como RESERVA condicional (CAS).
 *
 * O bug medido em 18/11/2026: dois POSTs concorrentes liam `recebido_qtd = 0`,
 * ajustavam o estoque pelos dois (o CAS de `ajustarEstoque` protege o saldo,
 * não a intenção) e o segundo sobrescrevia `recebido_qtd` com o mesmo valor do
 * primeiro — duas entradas de estoque para uma compra.
 *
 * A correção não muda a regra ("re-tick recebe só o que falta"): ela move a
 * decisão para um UPDATE condicional no valor lido. Quem chega depois encontra
 * `recebido_qtd` diferente e atualiza 0 linhas — e não movimenta estoque.
 *
 * Devolver a reserva (quando o ajuste de estoque falha) usa o MESMO CAS, para
 * não zerar um recebimento que outra requisição gravou no meio.
 */

export interface ResultadoDaReserva {
  reservado: boolean;
  erro: string | null;
}

export async function reservarRecebimento(
  supabase: SupabaseClient,
  args: {
    orgId: string;
    itemId: string;
    recebidoAtual: number;
    quantidade: number;
  },
): Promise<ResultadoDaReserva> {
  const { data, error } = await supabase
    .from("purchase_order_items")
    .update({ recebido_qtd: args.recebidoAtual + args.quantidade })
    .eq("organization_id", args.orgId)
    .eq("id", args.itemId)
    // O CAS: só grava se ninguém mudou o recebido desde a leitura.
    .eq("recebido_qtd", args.recebidoAtual)
    .select("id");

  if (error) return { reservado: false, erro: error.message };
  return { reservado: (data?.length ?? 0) > 0, erro: null };
}

export async function devolverReservaDeRecebimento(
  supabase: SupabaseClient,
  args: {
    orgId: string;
    itemId: string;
    recebidoAtual: number;
    quantidade: number;
  },
): Promise<boolean> {
  const { data, error } = await supabase
    .from("purchase_order_items")
    .update({ recebido_qtd: args.recebidoAtual })
    .eq("organization_id", args.orgId)
    .eq("id", args.itemId)
    // Só desfaz a NOSSA reserva: se outra requisição já avançou, não toca.
    .eq("recebido_qtd", args.recebidoAtual + args.quantidade)
    .select("id");

  return !error && (data?.length ?? 0) > 0;
}
