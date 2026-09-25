/**
 * NEXUS — rótulos de status de compra (purchase_orders, migration 0243).
 *
 * Funções puras (sem I/O): o banco guarda `status` em inglês no CHECK
 * (`rascunho | enviado | recebido | cancelado`) e a UI apresentar em PT-BR
 * com chip colorido. Sem mock, sem palpite.
 */

export type StatusCompra = "rascunho" | "enviado" | "recebido" | "cancelado";

export const STATUS_COMPRA: ReadonlyArray<StatusCompra> = [
  "rascunho",
  "enviado",
  "recebido",
  "cancelado",
];

const ROTULO: Record<StatusCompra, string> = {
  rascunho: "Rascunho",
  enviado: "Enviado",
  recebido: "Recebido",
  cancelado: "Cancelado",
};

const TONALIDADE: Record<StatusCompra, "cinza" | "azul" | "verde" | "vermelho"> = {
  rascunho: "cinza",
  enviado: "azul",
  recebido: "verde",
  cancelado: "vermelho",
};

/** Status desconhecido (nia do banco, schema mudou) → cai fora, nunca explode. */
export function ehStatusCompra(v: string): v is StatusCompra {
  return (STATUS_COMPRA as readonly string[]).includes(v);
}

export function rotuloStatusCompra(status: string): string {
  return ehStatusCompra(status) ? ROTULO[status] : status;
}

export function tonalidadeStatusCompra(status: string): "cinza" | "azul" | "verde" | "vermelho" {
  return ehStatusCompra(status) ? TONALIDADE[status] : "cinza";
}

/** Ordenação de lista: rascunho → enviado → recebido → cancelado por último. */
export function prioridadeStatusCompra(status: string): number {
  if (!ehStatusCompra(status)) return STATUS_COMPRA.length;
  return STATUS_COMPRA.indexOf(status);
}