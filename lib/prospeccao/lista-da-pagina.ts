/**
 * A LEITURA DA LISTA INICIAL DE BUSCAS NÃO PODE MENTIR.
 *
 * A página `/app/campanhas` lê `prospecting_searches` no servidor para o
 * primeiro paint. Erro de query virava `[]` silencioso e a tela dizia "Nenhuma
 * busca ainda" com 132 linhas no banco. Este helper separa as duas coisas:
 * falha é `erro: true` (a tela mostra o estado de erro), sucesso vazio é
 * `erro: false` (aí sim não há buscas).
 */
export interface ResultadoDaListaDeBuscas {
  buscas: Record<string, unknown>[];
  erro: boolean;
}

export function listaDeBuscasDaPagina(
  data: unknown,
  error: { message?: string } | null | undefined,
): ResultadoDaListaDeBuscas {
  if (error) return { buscas: [], erro: true };
  return { buscas: Array.isArray(data) ? (data as Record<string, unknown>[]) : [], erro: false };
}
