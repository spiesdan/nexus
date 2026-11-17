/**
 * AJUSTE DE ESTOQUE — uma porta só, com compare-and-swap.
 *
 * ─── O DEFEITO QUE ISTO CORRIGE ────────────────────────────────────────────
 *
 * Cada caminho fazia `select quantidade` → `update quantidade = lida ± delta`.
 * Duas operações concorrentes leem o mesmo saldo e a segunda sobrescreve a
 * primeira: a baixa de um pedido some, o recebimento de uma compra some. O
 * `check (quantidade >= 0)` do banco transforma a corrida em baixa PERDIDA,
 * não em erro visível.
 *
 * ─── COMO ─────────────────────────────────────────────────────────────────
 *
 * O UPDATE carrega `eq("quantidade", lida)` — compare-and-swap. Se ninguém
 * mexeu no saldo entre a leitura e a escrita, a linha é atualizada; se alguém
 * mexeu, o UPDATE devolve 0 linhas e a função relê e tenta de novo (até 4
 * vezes). Não precisa de RPC nem de migration, e o saldo nunca anda para trás.
 *
 * Devolve `estoque_insuficiente` sem gravar quando o delta deixaria o saldo
 * negativo e `permitirNegativo` é falso. Produto que não controla estoque é
 * no-op (devolve o saldo atual).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type ResultadoDoAjuste =
  | { ok: true; saldo: number }
  | { ok: false; motivo: "nao_encontrado" | "estoque_insuficiente" | "conflito" };

const TENTATIVAS = 4;

export async function ajustarEstoque(
  cliente: SupabaseClient,
  entrada: {
    organizationId: string;
    productId: string;
    /** Positivo repõe, negativo baixa. */
    delta: number;
    /** `true` só para ajuste manual explícito, nunca para venda. */
    permitirNegativo?: boolean;
  },
): Promise<ResultadoDoAjuste> {
  const { organizationId, productId, delta } = entrada;
  if (delta === 0) {
    const { data } = await cliente
      .from("catalog_products")
      .select("quantidade")
      .eq("id", productId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    return data
      ? { ok: true, saldo: Number((data as { quantidade: number }).quantidade) }
      : { ok: false, motivo: "nao_encontrado" };
  }

  for (let tentativa = 0; tentativa < TENTATIVAS; tentativa++) {
    const { data, error } = await cliente
      .from("catalog_products")
      .select("quantidade, controla_estoque")
      .eq("id", productId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (error || !data) return { ok: false, motivo: "nao_encontrado" };

    const atual = data as { quantidade: number; controla_estoque: boolean };
    if (!atual.controla_estoque) return { ok: true, saldo: Number(atual.quantidade) };

    const lida = Number(atual.quantidade);
    const novo = lida + delta;
    if (novo < 0 && !entrada.permitirNegativo) {
      return { ok: false, motivo: "estoque_insuficiente" };
    }

    const { data: atualizadas, error: erroUpdate } = await cliente
      .from("catalog_products")
      .update({ quantidade: novo })
      .eq("id", productId)
      .eq("organization_id", organizationId)
      // O CAS: só grava se o saldo ainda é o que acabamos de ler.
      .eq("quantidade", lida)
      .select("quantidade");

    if (erroUpdate) return { ok: false, motivo: "conflito" };
    if ((atualizadas ?? []).length > 0) return { ok: true, saldo: novo };
    // Outro processo mexeu no saldo: relê e tenta de novo.
  }
  return { ok: false, motivo: "conflito" };
}
