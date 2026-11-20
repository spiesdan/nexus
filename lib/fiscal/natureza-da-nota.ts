/**
 * A NATUREZA DA NOTA — o que `extras_fiscais.finalidade` quer dizer.
 *
 * O caso que trouxe isto (pedido 19560): duas NF-e autorizadas da mesma venda,
 * R$ 70 cada. Lidas na tela, pareciam duplicidade. No banco:
 *
 *   NF 4634 · extras_fiscais.finalidade ausente → 1 (normal, venda)
 *   NF 4644 · extras_fiscais.finalidade = 4     → DEVOLUÇÃO (ref_nfe preenchida)
 *
 * O motor do Sentinel já ignora finalidade 4 (`fiscal.nota_duplicada_por_pedido`);
 * o que faltava era a TELA dizer qual é qual.
 *
 * ─── A REGRA É A DO BANCO, NÃO UMA NOVA ──────────────────────────────────
 *
 * `coalesce(nullif(trim(finalidade), '')::int, 1)` — qualquer coisa ausente ou
 * vazia vira **1**. E 1 é venda: é o default fiscal, não um "desconhecido". Por
 * isso a função devolve sempre uma natureza; não existe caso "sem natureza".
 *
 * Finalidade inválida (texto que não é inteiro, ou fora de 1–4) também cai em
 * 1. É o que o banco faria com vazio; com lixo, o `::int` estouraria — e a tela
 * prefere ler como venda a esconder a nota.
 */

export type NaturezaDaNota = "venda" | "complementar" | "ajuste" | "devolucao";

export const ROTULO_DA_NATUREZA: Record<NaturezaDaNota, string> = {
  venda: "Venda",
  complementar: "Complementar",
  ajuste: "Ajuste",
  devolucao: "Devolução",
};

/** O que o jsonb pode trazer: número, texto (o Mercos escreve "4") ou nada. */
export interface ExtrasFiscais {
  finalidade?: unknown;
  ref_nfe?: unknown;
  [chave: string]: unknown;
}

/**
 * `coalesce(nullif(...,'')::int, 1)` em TypeScript.
 *
 * Devolve 1..4; qualquer outra coisa é 1 (venda), que é o default do banco.
 */
export function finalidadeDaNota(extras: ExtrasFiscais | null | undefined): 1 | 2 | 3 | 4 {
  const bruto = extras?.finalidade;
  if (bruto === null || bruto === undefined) return 1;
  const texto = String(bruto).trim();
  if (texto === "") return 1;
  const numero = Number(texto);
  if (!Number.isInteger(numero) || numero < 1 || numero > 4) return 1;
  return numero as 1 | 2 | 3 | 4;
}

/** A natureza legível + a chave da nota devolvida (só faz sentido na 4). */
export function naturezaDaNota(extras: ExtrasFiscais | null | undefined): {
  natureza: NaturezaDaNota;
  finalidade: 1 | 2 | 3 | 4;
  refNfe: string | null;
} {
  const finalidade = finalidadeDaNota(extras);
  const natureza: NaturezaDaNota =
    finalidade === 4
      ? "devolucao"
      : finalidade === 2
        ? "complementar"
        : finalidade === 3
          ? "ajuste"
          : "venda";

  // `ref_nfe` é a CHAVE de 44 dígitos da nota original. Lixo não vira link.
  const bruto = extras?.ref_nfe;
  const refNfe = typeof bruto === "string" && /^\d{44}$/.test(bruto.trim()) ? bruto.trim() : null;

  return { natureza, finalidade, refNfe };
}
