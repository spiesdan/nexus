import type { HistoricoCompra, SituacaoRecompra } from "@/lib/comercial/radar-compras";

/**
 * NEXUS Copilot — contexto real por página (NEXUS 2.0 §33, fundação).
 *
 * O Copilot entende a página atual. Este módulo é PURO: recebe dados já
 * lidos (com `organization_id` explícito, na rota) e devolve resumo +
 * perguntas sugeridas. Sem I/O, sem mock, testável.
 *
 * Responder de verdade (LLM sobre este contexto) é FASE 5; aqui o
 * contrato de dados já nasce correto.
 */

export type PaginaCopilot = "cliente" | "radar";

export const PAGINAS_COPILOT = ["cliente", "radar"] as const;

/** Perguntas que o Copilot sugere em cada página (§33). Chaves estáveis. */
export function perguntasPara(pagina: PaginaCopilot): string[] {
  switch (pagina) {
    case "cliente":
      return ["risco_do_cliente", "proxima_acao", "potencial_de_recompra"];
    case "radar":
      return ["quem_agir_primeiro", "porque_aqui", "oportunidades_abertas"];
  }
}

/** Uma frase sobre o cliente a partir do histórico real (ciclo, atraso). */
export function resumirCliente(h: HistoricoCompra): string {
  const ciclo = h.intervalo_mediano_dias ?? h.intervalo_medio_dias;
  const base =
    ciclo != null
      ? `ciclo mediano ${ciclo} dias, última compra há ${h.dias_sem_compra} dias (atraso ${h.atraso_dias} dias)`
      : `${h.qtd_pedidos} compra(s), última há ${h.dias_sem_compra} dias, sem ciclo medido`;
  return `${base}; situação ${h.situacao}.`;
}

export type ContagemRadar = Record<SituacaoRecompra, number>;

/** Resumo do radar: quantos pedem ação em cada situação + total na amostra. */
export function resumirRadar(contagem: ContagemRadar, total: number, parcial: boolean): string {
  const pedemAcao =
    contagem.em_risco + contagem.recompra_atrasada + contagem.oportunidade_aberta + contagem.cancelado_sem_nova;
  const amostra = parcial ? "amostra parcial dos pedidos recentes" : "base completa";
  return `${pedemAcao} de ${total} clientes pedem ação (${amostra}): ${contagem.em_risco} em risco, ${contagem.recompra_atrasada} com recompra atrasada, ${contagem.oportunidade_aberta} com oportunidade aberta.`;
}

export function contagemVazia(): ContagemRadar {
  return {
    em_voo: 0,
    recompra_atrasada: 0,
    em_risco: 0,
    oportunidade_aberta: 0,
    cancelado_sem_nova: 0,
    novo_sem_compras: 0,
    primeira_compra: 0,
    ok: 0,
  };
}
