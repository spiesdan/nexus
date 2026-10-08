/**
 * CONSULTAR COM LISTA DE IDS SEM ESTOURAR A URL.
 *
 * O PostgREST monta `in.(a,b,c…)` na QUERY STRING, e a URL tem limite de
 * tamanho. Medido na VPS: **500 UUIDs = 18.499 bytes**, e a resposta é
 *
 *   HTTP 414 {"code":"PGRST103","details":"URI too long"}
 *
 * O que a rota fazia com isso: `fail("internal_error", …, 500)` — o chamador via
 * **erro 500 na tela** com o banco sãozinho. Quebrou a aba Radar, e é o MESMO
 * defeito que já tinha quebrado o lote de fotos dos produtos.
 *
 * ─── Por que isto é um helper e não uma dica ─────────────────────────────────
 *
 * Porque o defeito se repete: apareceu em duas rotas independentes, em arquivos
 * que ninguém ligou um ao outro, e nas duas vezes a URL grande virou um 500 na
 * tela. Um comentário nas duas não impede a terceira. A regra mora num lugar só
 * — e a fatia de 100 é o número medido, não um palpite: 100 ids dão ~3,8 KB,
 * bem abaixo do limite.
 *
 * ─── Por que não resolvemos no banco (uma RPC) ──────────────────────────────
 *
 * Poderia: `= any($1)` resolve em uma ida. Mas mudaria o plano do Postgres e
 * exigiria migration em toda instalação já existente, para um problema que uma
 * fatia de tamanho resolve.
 */

/** Acima disto a URL estoura — ver a medição no cabeçalho. */
export const FATIA_DE_IDS = 100;

/**
 * Aplica `aplicar` sobre a lista de ids em fatias de 100 e junta os resultados.
 *
 * `aplicar` recebe UMA fatia e devolve linhas. As fatias vão em PARALELO
 * (`Promise.all`): em série, 500 ids seriam 5 idas somando latência — o custo
 * que este arquivo existe para não pagar.
 *
 * Uma fatia que falha NÃO derruba as outras: o chamador recebe o que deu e
 * decide. Perder tudo por causa de um pedaço é pior do que perder o pedaço.
 *
 * `aplicar` devolve `{ linhas, erro }` para poder sinalizar falha por fatia
 * sem exception — é o que o PostgREST faz, devolvendo `error` em vez de
 * lançar.
 */
export async function porFatias<T>(
  ids: string[],
  aplicar: (fatia: string[]) => Promise<{ linhas: T[]; erro?: unknown }>,
): Promise<{ linhas: T[]; falhas: number }> {
  if (ids.length === 0) return { linhas: [], falhas: 0 };

  const fatias: string[][] = [];
  for (let i = 0; i < ids.length; i += FATIA_DE_IDS) {
    fatias.push(ids.slice(i, i + FATIA_DE_IDS));
  }

  const respostas = await Promise.all(fatias.map((fatia) => aplicar(fatia)));

  const linhas: T[] = [];
  let falhas = 0;
  for (const r of respostas) {
    if (r.erro) falhas++;
    linhas.push(...r.linhas);
  }
  return { linhas, falhas };
}
