/**
 * COLISÕES DE NÚMERO MERCOS × CRM.
 *
 * Contrato acordado com o backend (GET `/api/v1/mercos/colisoes`):
 *
 *   { itens: [{ numero_mercos, cliente_mercos_nome, cliente_local_nome,
 *               valor_cents, visto_em, pedido_importado_id }] }
 *
 * A tela não inventa dado: cliente sem nome é DITO como sem nome, e o número
 * local de um pedido já importado só aparece se o backend informar
 * `numero_local` (campo opcional, tolerado até o G confirmar o contrato final).
 */

export const ENDPOINT_COLISOES_MERCOS = "/api/v1/mercos/colisoes";

export interface ColisaoMercos {
  numero_mercos: number;
  cliente_mercos_nome: string | null;
  /** Quem ocupa hoje, no CRM, o número que veio do Mercos. */
  cliente_local_nome: string | null;
  valor_cents: number;
  visto_em: string;
  /** null = não entrou; preenchido = já importado como este pedido local. */
  pedido_importado_id: string | null;
  /** Opcional enquanto o contrato final não é fechado com o backend. */
  numero_local?: number | null;
}

export interface RespostaColisoesMercos {
  data: { itens: ColisaoMercos[] };
}

export const SEM_CLIENTE_MERCOS = "cliente não informado no Mercos";
export const SEM_CLIENTE_LOCAL = "cliente não informado no CRM";

export function nomeClienteMercos(colisao: ColisaoMercos): string {
  return colisao.cliente_mercos_nome?.trim() || SEM_CLIENTE_MERCOS;
}

export function nomeClienteLocal(colisao: ColisaoMercos): string {
  return colisao.cliente_local_nome?.trim() || SEM_CLIENTE_LOCAL;
}

export function rotuloEstado(colisao: ColisaoMercos): string {
  if (!colisao.pedido_importado_id) return "não entrou";
  return colisao.numero_local != null
    ? `importado como nº ${colisao.numero_local}`
    : "importado";
}

export function rotuloData(vistoEm: string, tagDoIdioma: string): string {
  const data = new Date(vistoEm);
  if (Number.isNaN(data.getTime())) return "data não informada";
  // O idioma vem da camada (organização), não de um literal: a instalação
  // pode estar em inglês e a data não pode denunciar o contrário.
  return data.toLocaleString(tagDoIdioma, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
