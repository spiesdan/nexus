import { decidir, type NivelAutonomia, type OrchestratorDecisao } from "@/lib/ai/orchestrator/decide";
import type { BrainRecomendacao } from "@/lib/ai/sales-brain/recommend";

/**
 * NEXUS Sales Orchestrator — runner sobre o Brain (FASE 10, fundação).
 *
 * Puro: recebe recomendações + nível + sinais operacionais e devolve uma
 * decisão proposta por contato. NÃO executa nada externo — execução vive
 * atrás de aprovação (parte 2). Quem chama registra via auditoria
 * (`ai.action.proposed`) e o Decision Log se lê em `/api/v1/audit`.
 */

export interface SinaisOperacionais {
  tem_saldo_estoque: boolean;
  financeiramente_apto: boolean;
  /** false = sinais assumidos (padrão), não verificados no estoque/financeiro. */
  verificados: boolean;
}

export const SINAIS_ASSUMIDOS: SinaisOperacionais = {
  tem_saldo_estoque: true,
  financeiramente_apto: true,
  verificados: false,
};

export interface DecisaoProposta extends OrchestratorDecisao {
  contact_id: string;
  prioridade: BrainRecomendacao["prioridade"];
}

/** Uma decisão por recomendação (recompra prevista ou cliente em risco). */
export function proporAcoes(
  recs: BrainRecomendacao[],
  nivel: NivelAutonomia,
  sinais: SinaisOperacionais = SINAIS_ASSUMIDOS,
): DecisaoProposta[] {
  return recs.map((r) => {
    const evento = r.situacao === "em_risco" ? "cliente_em_risco" : "recompra_prevista";
    const d = decidir(
      evento,
      {
        contact_id: r.contact_id,
        dias_sem_compra: r.dias_sem_compra,
        atraso_dias: r.atraso_dias,
        prioridade: r.prioridade,
        tem_saldo_estoque: sinais.tem_saldo_estoque,
        financeiramente_apto: sinais.financeiramente_apto,
      },
      nivel,
    );
    return {
      ...d,
      contact_id: r.contact_id,
      prioridade: r.prioridade,
      governanca: {
        ...d.governanca,
        dados_utilizados: sinais.verificados
          ? d.governanca.dados_utilizados
          : [...d.governanca.dados_utilizados, "sinais_nao_verificados"],
      },
    };
  });
}
