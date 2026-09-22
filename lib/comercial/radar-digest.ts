import {
  historicoDeCompra,
  type PedidoParaRadar,
  type SituacaoRecompra,
} from "./radar-compras";

// Reexportado para os testes ao lado (`radar-digest.test.ts`): o tipo nasce
// em `radar-compras` (fonte única) e este módulo é a porta de entrada do digest.
export type { PedidoParaRadar };

/**
 * DIGEST DO RADAR — contagens para a Central de avisos (cron radar-digest).
 *
 * Reusa `historicoDeCompra` (a mesma classificação da tela): o número do
 * aviso e o número do Radar saem da mesma conta, nunca de duas.
 */

export interface ContagemRadar {
  emRisco: number;
  recompraAtrasada: number;
  perda: number;
  monitorados: number;
}

const VAZIO: ContagemRadar = { emRisco: 0, recompraAtrasada: 0, perda: 0, monitorados: 0 };

/** Agrega históricos já calculados por contato. Pura — testada ao lado. */
export function contarSituacoes(
  historicos: { situacao: SituacaoRecompra }[],
): ContagemRadar {
  const contagem: ContagemRadar = { ...VAZIO, monitorados: historicos.length };
  for (const h of historicos) {
    if (h.situacao === "em_risco") contagem.emRisco += 1;
    else if (h.situacao === "recompra_atrasada") contagem.recompraAtrasada += 1;
    else if (h.situacao === "cancelado_sem_nova") contagem.perda += 1;
  }
  return contagem;
}

/** Classifica todos os contatos com pedido e conta. `hoje` em "YYYY-MM-DD". */
export function resumirRadar(pedidos: PedidoParaRadar[], hoje: string): ContagemRadar {
  const contatos = new Set<string>();
  for (const p of pedidos) {
    if (p.contact_id) contatos.add(p.contact_id);
  }
  const historicos = [...contatos].map((id) => historicoDeCompra(pedidos, id, hoje));
  return contarSituacoes(historicos);
}

/** Texto do item da Central. PT direto, como os demais kinds (precedente). */
export function textoDoDigest(c: ContagemRadar): { title: string; body: string } {
  const partes: string[] = [];
  if (c.emRisco > 0) partes.push(`${c.emRisco} em alto risco`);
  if (c.recompraAtrasada > 0) partes.push(`${c.recompraAtrasada} com recompra atrasada`);
  if (c.perda > 0) partes.push(`${c.perda} cancelados sem nova compra`);
  return {
    title: "Resumo do Radar de hoje",
    body: `${partes.join(" · ")}. Veja no Radar quem agir primeiro.`,
  };
}

/** Digest vazio não vira aviso: sem o que dizer, sem spam. */
export function temOQueDizer(c: ContagemRadar): boolean {
  return c.emRisco + c.recompraAtrasada + c.perda > 0;
}
