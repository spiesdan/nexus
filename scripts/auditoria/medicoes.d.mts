/** Tipos do mesclador de medições do instrumento (`medicoes.mjs`). */

export interface Medicao {
  rota: string;
  largura: string;
  status: number;
  ms: number;
  erro: string | null;
  arquivo: string | null;
  [chave: string]: unknown;
}

export interface ArtefatoDeMedicoes {
  base: string;
  grupo: string;
  perfil: string;
  url_depois_do_login: string;
  atualizado_em: string;
  puladas: unknown[];
  resultados: Medicao[];
}

/**
 * `anterior` aceita o arquivo como estiver no disco: JSON corrompido, campo
 * ausente ou até lista com item inválido não pode derrubar a rodada.
 */
export function mesclarMedicoes(
  anterior: { resultados?: unknown } | null | undefined,
  novas: Medicao[],
): Medicao[];

export function montarArtefato(entrada: {
  base: string;
  grupo: string;
  perfil: string;
  urlDepoisDoLogin: string;
  puladas?: unknown[];
  novas: Medicao[];
  anterior?: { resultados?: unknown; puladas?: unknown } | null;
}): ArtefatoDeMedicoes;
