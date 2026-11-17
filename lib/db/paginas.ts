/**
 * LER UMA TABELA INTEIRA SEM PARAR NA PRIMEIRA PÁGINA DO POSTGREST.
 *
 * O PostgREST responde no MÁXIMO 1000 linhas por requisição quando o cliente
 * não pede `range` — e não avisa: o retorno é uma lista completa *do ponto de
 * vista de quem não sabe que existe mais*. Foi o que travou uma campanha de
 * prospecção: a organização passou de 1002 linhas em `prospecting_sends`, as 2
 * primeiras ficaram fora da página, o motor as escolhia de novo, a unique
 * recusava a reserva e a campanha ficava presa no mesmo ponto para sempre.
 *
 * ─── Por que isto é um helper e não um `.range()` em cada lugar ──────────────
 *
 * Porque o defeito é SILENCIOSO e se repete: quem escreve a consulta não vê a
 * linha 1001 faltar, e a leitura parece certa. A regra mora num lugar só, com
 * a ordem estável exigida — paginar por OFFSET sem `ORDER BY` é trocar um corte
 * por outro: o Postgres não promete a mesma ordem entre duas páginas, e uma
 * linha pode aparecer duas vezes enquanto outra desaparece.
 *
 * ─── A ordem é do chamador, de propósito ───────────────────────────────────
 *
 * Cada tabela tem a sua chave natural, e inventar um default (`id`) faria a
 * leitura de um ledger em ordem de UUID, que não é nem a ordem do tempo nem
 * estável para o que se quer. O helper cobra `ORDER BY` pelo tipo: quem chama
 * passa a consulta JÁ ordenada.
 */

/** O teto do PostgREST por resposta — medido, não escolhido por gosto. */
export const PAGINA_DO_POSTGREST = 1000;

export interface OpcoesDaLeitura {
  /** Tamanho da página. O default é o teto do PostgREST (1000). */
  tamanho?: number;
  /**
   * Guarda de MEMÓRIA, não de comportamento: acima disto a leitura para com
   * erro em vez de encher o processo. Quem lê um ledger de uma organização
   * precisa saber que existe um limite — e vê-lo na tela (`ledger_indisponivel`)
   * em vez de receber um recorte silencioso.
   */
  teto?: number;
}

/**
 * Executa `consulta` em páginas até a última e junta as linhas.
 *
 * `consulta` recebe o intervalo (inclusivo, como o `.range()`) e devolve o
 * thenable do Supabase — o helper só encadeia `range` e espera.
 *
 * Para no primeiro erro: devolver metade do ledger como se fosse o todo é o
 * defeito que este arquivo existe para consertar, um nível acima. O chamador
 * recebe `erro` junto com o que já leu e decide (o motor da prospecção pula a
 * campanha em vez de mandar para quem já recebeu).
 */
export async function lerEmPaginas<T>(
  consulta: (de: number, ate: number) => PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>,
  opcoes: OpcoesDaLeitura = {},
): Promise<{ linhas: T[]; erro: { message: string } | null }> {
  const tamanho = opcoes.tamanho ?? PAGINA_DO_POSTGREST;
  const teto = opcoes.teto;
  if (tamanho <= 0) throw new Error("lerEmPaginas: tamanho de página inválido");
  const linhas: T[] = [];
  for (let de = 0; ; de += tamanho) {
    const { data, error } = await consulta(de, de + tamanho - 1);
    if (error) return { linhas, erro: error };
    const lote = (data ?? []) as T[];
    for (const linha of lote) linhas.push(linha);
    if (teto !== undefined && linhas.length > teto) {
      return { linhas, erro: { message: `acima de ${teto} linhas` } };
    }
    // Página incompleta = fim. A cheia pode ser a última de uma tabela com
    // múltiplo exato de 1000: aí a próxima vem vazia e o laço fecha nela.
    if (lote.length < tamanho) return { linhas, erro: null };
  }
}
