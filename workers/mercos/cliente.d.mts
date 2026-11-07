/**
 * Tipos do parser do cliente do Mercos (`cliente.mjs`).
 *
 * O worker roda em Node puro (`.mjs`, sem build), então a fonte é JS. Esta
 * declaração existe para o teste em TypeScript ler o parser com o contrato
 * explícito — sem `any`.
 */
export type ClienteDoMercos = {
  razao: string | null;
  documento: string | null;
  fantasia: string | null;
  telefone: string | null;
  cidade: string | null;
};

export type CartaoDoPedido = {
  numero: number | null;
  status: string | null;
  vendedor_lista: string | null;
  razao_lista: string | null;
  fantasia_lista: string | null;
};

export declare const CONSUMIDOR_FINAL: string;

export declare function lerCliente(
  linhas: string[],
  opcoes?: { documentoRepresentada?: string | null },
): ClienteDoMercos;

export declare function lerCartao(linhas: string[]): CartaoDoPedido;
