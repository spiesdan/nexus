/**
 * FECHAMENTO DE CARGA — a prestação de contas que o PDF deixava em branco.
 *
 * ═══ O QUE MUDA COM ISTO ═════════════════════════════════════════════════
 *
 * O PDF de romaneio imprimia a conferência de caixa como LINHAS VAZIAS:
 *
 *   Dinheiro em espécie contado        R$ ______
 *   Comprovantes de PIX                 R$ ______
 *   Canhotos de cartão                  R$ ______
 *   Cheques recebidos                   R$ ______
 *   Boletos entregues / assinados       R$ ______
 *   (−) Vale ao motorista               R$ ______
 *   (−) Combustível / pedágio           R$ ______
 *   (−) Outras despesas autorizadas     R$ ______
 *   Total líquido entregue ao caixa     R$ ______
 *   Diferença (sobra / falta)           R$ ______
 *
 * O papel era preenchido, guardado num arquivo físico, e a diferença era
 * conferida de olho. Este arquivo é a MESMA lista com a conta feita.
 *
 * ═══ A CONTA, E POR QUE ELA É ASSIM ═══════════════════════════════════════
 *
 *   entradas  = dinheiro + pix + cartao + cheques + boletos
 *   saidas    = vale_motorista + combustivel + outras_despesas
 *   liquido   = entradas − saidas
 *   esperado  = a cobrar na entrega (vem de `resumoDoFechamento`, do PDF)
 *   diferenca = liquido − esperado        (+ sobra, − falta)
 *
 * As três primeiras saídas são **descontos** e as cinco primeiras são
 * **entradas**, por isso a soma é com sinal. Um erro aqui é dinheiro: se as
 * despesas entrassem com sinal positivo, a diferença daria sobras que não
 * existem e o caixa fecharia "batendo" com dinheiro que não entrou.
 *
 * ═══ POR QUE AS LINHAS SÃO UM ARRAY, E NÃO OITO CAMPOS ═══════════════════
 *
 * Porque o PDF já trazia as oito com NOMES, e essa lista é a que o dono
 * conhece. Com oito campos na tabela, acrescentar a nona linha — "vale
 * de combustível", "taxa de cartão", o que aparecer — vira migration, backfill e
 * migração de dado. Com uma linha por item, vira um item novo.
 *
 * O `key` é o que amarra a linha ao campo: `dinheiro`, `pix`, `cartao`,
 * `cheques`, `boletos`, `vale_motorista`, `combustivel`, `outras_despesas`.
 * Ele é estável e é o que o teste usa.
 *
 * ═══ POR QUE ISSO NÃO É "DÁR BAIXA" ══════════════════════════════════════
 *
 * Fechar o caixa é CONFERIR dinheiro. Dar baixa nos pedidos é outra decisão,
 * que já tem regra escrita e testada em `lib/comercial/conciliacao-carga.ts`.
 * Aqui não se dá baixa em nada: o fechamento registra o que foi contado e
 * diz se sobrou ou faltou.
 */

/** Os pares de chave, rótulo e sinal. A ordem é a do PDF, e a tela usa esta. */
export const LINHAS_DO_CAIXA = [
  { chave: "dinheiro", rotulo: "Dinheiro em espécie contado", entrada: true },
  { chave: "pix", rotulo: "Comprovantes de PIX", entrada: true },
  { chave: "cartao", rotulo: "Canhotos de cartão (débito/crédito)", entrada: true },
  { chave: "cheques", rotulo: "Cheques recebidos", entrada: true },
  { chave: "boletos", rotulo: "Boletos entregues / assinados", entrada: true },
  { chave: "vale_motorista", rotulo: "Vale ao motorista (adiantamento)", entrada: false },
  { chave: "combustivel", rotulo: "Combustível / pedágio", entrada: false },
  { chave: "outras_despesas", rotulo: "Outras despesas autorizadas de viagem", entrada: false },
] as const;

export type ChaveDaLinha = (typeof LINHAS_DO_CAIXA)[number]["chave"];

/** Linha gravada, em cents. Ausente = 0 (a linha existe no PDF e nasce vazia). */
export type LinhaDoCaixa = { chave: ChaveDaLinha; valor_cents: number };

export interface ContaDoCaixa {
  entradas_cents: number;
  saidas_cents: number;
  /** O que o motorista devolveu ao caixa. */
  liquido_cents: number;
  /** Quanto deveria ter voltado — o "a cobrar" do resumo da carga. */
  esperado_cents: number;
  /** Positivo sobrou, negativo faltou. */
  diferenca_cents: number;
  /** `true` quando `diferenca_cents === 0`. */
  bate: boolean;
}

/** Toda linha do PDF, na ordem do PDF, com zero onde nada foi contado. */
export function linhasCompletas(linhas: LinhaDoCaixa[]): LinhaDoCaixa[] {
  const soma = new Map<ChaveDaLinha, number>();
  for (const l of linhas) {
    soma.set(l.chave, (soma.get(l.chave) ?? 0) + (Number.isFinite(l.valor_cents) ? l.valor_cents : 0));
  }
  return LINHAS_DO_CAIXA.map((l) => ({ chave: l.chave, valor_cents: soma.get(l.chave) ?? 0 }));
}

/**
 * A conta do caixa.
 *
 * `esperado_cents` vem de fora — é o "a cobrar na entrega", que sai de
 * `resumoDoFechamento` sobre as paradas. Esta função não sabe o que é uma
 * parada; ela só compara o que foi contado com o que era esperado.
 */
export function contaDoCaixa(
  linhas: LinhaDoCaixa[],
  esperado_cents: number,
): ContaDoCaixa {
  let entradas = 0;
  let saidas = 0;
  for (const { chave, valor_cents } of linhasCompletas(linhas)) {
    const entrada = LINHAS_DO_CAIXA.some((l) => l.chave === chave && l.entrada);
    const valor = Number.isFinite(valor_cents) ? Math.trunc(valor_cents) : 0;
    if (entrada) entradas += valor;
    else saidas += valor;
  }
  const liquido = entradas - saidas;
  const esperado = Number.isFinite(esperado_cents) ? Math.trunc(esperado_cents) : 0;
  const diferenca = liquido - esperado;
  return {
    entradas_cents: entradas,
    saidas_cents: saidas,
    liquido_cents: liquido,
    esperado_cents: esperado,
    diferenca_cents: diferenca,
    bate: diferenca === 0,
  };
}

/**
 * O que impede o fechamento de fechar.
 *
 * A lista é curta de propósito: são só as travas que alguém **precisa** ter ao
 * olho para o "fechou" significar alguma coisa. Regra de negócio que não está
 * escrita — "qual diferença é aceitável", "quem pode fechar" — NÃO é inventada
 * aqui; o que a função impede é o fechamento que não pode ser undo.
 */
export interface AvisoDoFechamento {
  nivel: "erro" | "atencao";
  texto: string;
}

export function avisosDoFechamento(
  conta: ContaDoCaixa,
  conferidas: number,
  totalParadas: number,
): AvisoDoFechamento[] {
  const avisos: AvisoDoFechamento[] = [];

  // A conferência física: sem ela, o "fechou" é uma declaração, não uma
  // conferência. Bloqueia.
  if (totalParadas > 0 && conferidas === 0) {
    avisos.push({
      nivel: "erro",
      texto: "Nenhuma parada foi conferida. O fechamento sem conferência é uma declaração, não um fechamento.",
    });
  } else if (totalParadas > 0 && conferidas < totalParadas) {
    avisos.push({
      nivel: "atencao",
      texto: `Faltam conferir ${totalParadas - conferidas} de ${totalParadas} paradas.`,
    });
  }

  // Diferença diferente de zero é ATENÇÃO, não erro: happens no caixa o
  // motorista volta com troco a menos e o conferente anota. O que não pode é a
  // diferença passar sem ninguém ver.
  if (!conta.bate) {
    avisos.push({
      nivel: "atencao",
      texto:
        conta.diferenca_cents > 0
          ? `Sobra de ${(conta.diferenca_cents / 100).toFixed(2)} sobre o esperado.`
          : `Falta de ${(Math.abs(conta.diferenca_cents) / 100).toFixed(2)} sobre o esperado.`,
    });
  }

  // Linha de entrada em zero com dinheiro esperado é o caso clássico: o
  // motorista não contou nada e a diferença "bate" porque os dois são zero.
  const semEntradas = conta.entradas_cents === 0 && conta.esperado_cents > 0;
  if (semEntradas) {
    avisos.push({
      nivel: "atencao",
      texto: "Nenhuma entrada contada, mas há valor a cobrar. Confira se o campo ficou em branco.",
    });
  }

  return avisos;
}