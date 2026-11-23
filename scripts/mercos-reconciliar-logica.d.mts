/**
 * Tipos do script de reconciliação (JS puro, roda com `node`).
 *
 * Existe para o teste de unidade poder importar a lógica sem `@ts-expect-error`
 * espalhado: o script é operacional e não entra no build, mas a regra que ele
 * implementa (colisão × ausência × pedido sem item) é testada como qualquer
 * outra — e um `any` implícito ali esconderia justamente o erro que o teste
 * existe para pegar.
 */
export function soDigitos(texto: string | null | undefined): string;
export function nomeNormalizado(texto: string | null | undefined): string;
export function mesmoCliente(
  nomeLista: string | null | undefined,
  nomeBanco: string | null | undefined,
  documentoLista?: string | null,
  documentoBanco?: string | null,
): boolean;
export function classificarNumero(entrada: {
  nomeLista: string | null | undefined;
  documentoLista?: string | null;
  linhasBanco?: Array<{ cliente_nome?: string | null; cliente_documento?: string | null }>;
}): string;
export function temItens(registro: unknown): boolean;
export function classificarComDetalhe(entrada: {
  situacao: string;
  detalhe?: { itens?: unknown[] } | null;
}): string;
export function payloadDeImportacao(registro: Record<string, unknown>): Record<string, unknown>;
export function dentroDaJanela(
  registro: { data_emissao?: string | null },
  agoraMs: number,
  dias?: number,
): boolean;
