import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A REIVINDICAÇÃO DE UM LADO DA IMPORTAÇÃO DE ENTRADA (CAS).
 *
 * ─── O DEFEITO QUE ISTO CORRIGE ────────────────────────────────────────────
 *
 * Medido em 18/11/2026 na rota `POST /api/v1/fiscal-entradas/[id]/importar`:
 * ela lia `estoque_processado_em`, percorria os itens somando quantidade ao
 * catálogo e só no fim gravava o flag. Dois POSTs concorrentes (duplo clique,
 * retry do cliente, sync + clique) liam `null` os dois, movimentavam o estoque
 * os dois e o segundo sobrescrevia a marcação — **a mesma nota entrava duas
 * vezes no estoque**. O pagável não sofria disso porque o unique
 * `(organization_id, entrada_id, parcela_n)` barra a segunda parcela; o
 * estoque não tinha trava equivalente.
 *
 * A correção não muda a regra ("cada lado é processado uma vez"): ela move a
 * decisão para um UPDATE condicional no flag. Quem chega depois encontra o
 * campo preenchido, atualiza 0 linhas e NÃO movimenta nada.
 *
 * O flag é a reivindicação E a conclusão. Isso é de propósito: liberar a
 * reivindicação depois de uma falha parcial faria o retry somar de novo os
 * itens que já entraram (movimentação de estoque não é transacional entre
 * linhas). Falha parcial vira aviso na resposta e exige correção humana —
 * nunca duplicação silenciosa.
 */

export type LadoDaImportacao = "estoque" | "financeiro";

const COLUNA_DO_LADO: Record<LadoDaImportacao, string> = {
  estoque: "estoque_processado_em",
  financeiro: "financeiro_processado_em",
};

export type ResultadoDaReivindicacao =
  | { estado: "reivindicado" }
  | { estado: "ja_processado" }
  | { estado: "em_andamento" }
  | { estado: "erro"; erro: string };

export async function reivindicarLadoDaImportacao(
  cliente: SupabaseClient,
  args: { orgId: string; entradaId: string; lado: LadoDaImportacao },
): Promise<ResultadoDaReivindicacao> {
  const coluna = COLUNA_DO_LADO[args.lado];
  const agora = new Date().toISOString();
  // Payload explícito por lado: o tipo gerado do Supabase recusa chave
  // computada (`{[coluna]: valor}`) — e aqui o erro de tipo esconderia a trava.
  const valores =
    args.lado === "estoque"
      ? { estoque_processado_em: agora }
      : { financeiro_processado_em: agora };

  const { data, error } = await cliente
    .from("fiscal_entradas")
    .update(valores)
    .eq("organization_id", args.orgId)
    .eq("id", args.entradaId)
    // O CAS: só reivindica o lado que ninguém processou ainda.
    .is(coluna, null)
    .select("id");

  if (error) return { estado: "erro", erro: error.message };
  if ((data ?? []).length > 0) return { estado: "reivindicado" };

  // Zero linhas: ou o lado já estava processado, ou outra requisição acabou
  // de reivindicar. Reler o flag distingue os dois casos — e o segundo merece
  // 409 (ainda em andamento), não um falso "importada".
  const { data: atual, error: erroLeitura } = await cliente
    .from("fiscal_entradas")
    .select(coluna)
    .eq("organization_id", args.orgId)
    .eq("id", args.entradaId)
    .maybeSingle();
  if (erroLeitura) return { estado: "erro", erro: erroLeitura.message };
  if (!atual) return { estado: "erro", erro: "entrada não encontrada" };
  const marcado = (atual as unknown as Record<string, string | null>)[coluna];
  return marcado ? { estado: "ja_processado" } : { estado: "em_andamento" };
}
