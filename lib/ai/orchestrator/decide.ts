/**
 * NEXUS Sales Orchestrator — decisão pura evento → ação (§36).
 *
 * Camada responsável por decidir: evento → contexto → prioridade →
 * intenção → ferramenta → ação → resultado → aprendizado.
 *
 * Esta função é PURA (sem I/O): recebe o evento + contexto mínimo e
 * devolve a decisão + trilha de governança. Workers/APIs executam e
 * registram no AI Decision Log.
 */

export type NivelAutonomia = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type OrchestratorEvento =
  | "recompra_prevista"
  | "cliente_em_risco"
  | "mensagem_recebida"
  | "proposta_sem_resposta"
  | "pedido_criado"
  | "pagamento_recebido";

export type OrchestratorFerramenta =
  | "criar_oportunidade"
  | "gerar_abordagem"
  | "enviar_whatsapp"
  | "criar_pedido"
  | "agendar_followup"
  | "encaminhar_humano"
  | "nenhuma";

export interface OrchestratorContexto {
  contact_id: string | null;
  dias_sem_compra: number;
  atraso_dias: number;
  prioridade: "alta" | "media" | "baixa";
  tem_saldo_estoque: boolean;
  financeiramente_apto: boolean;
}

export interface OrchestratorDecisao {
  evento: OrchestratorEvento;
  intencao: string;
  ferramenta: OrchestratorFerramenta;
  acao: string;
  requer_aprovacao: boolean;
  nivel_usado: NivelAutonomia;
  governanca: {
    quem_decidiu: "sales-orchestrator";
    dados_utilizados: string[];
    politica_aplicada: string;
  };
}

/**
 * Política (§35 + §38): ação externa (whatsapp/pedido) sempre exige
 * aprovação até nível 3; nível ≥4 executa ações comerciais permitidas
 * quando há estoque + aptidão financeira; sem isso, encaminha p/ humano.
 */
export function decidir(
  evento: OrchestratorEvento,
  ctx: OrchestratorContexto,
  nivel: NivelAutonomia,
): OrchestratorDecisao {
  const dados = ["ultima_compra", "ciclo_mediano", "atraso_dias", "estoque", "financeiro"];
  const base = {
    evento,
    governanca: {
      quem_decidiu: "sales-orchestrator" as const,
      dados_utilizados: dados,
      politica_aplicada: `autonomia-nivel-${nivel}`,
    },
  };
  if (!ctx.financeiramente_apto) {
    return {
      ...base,
      intencao: "proteger_credito",
      ferramenta: "encaminhar_humano",
      acao: "Cliente inapto financeiramente — encaminhar para humano.",
      requer_aprovacao: false,
      nivel_usado: nivel,
    };
  }
  switch (evento) {
    case "recompra_prevista":
    case "cliente_em_risco":
      if (!ctx.tem_saldo_estoque) {
        return {
          ...base,
          intencao: "aguardar_estoque",
          ferramenta: "agendar_followup",
          acao: "Sem saldo em estoque — agendar follow-up para quando houver.",
          requer_aprovacao: false,
          nivel_usado: nivel,
        };
      }
      if (nivel <= 3) {
        return {
          ...base,
          intencao: "propor_abordagem",
          ferramenta: "gerar_abordagem",
          acao: "Gerar abordagem de recompra e enviar para aprovação.",
          requer_aprovacao: true,
          nivel_usado: nivel,
        };
      }
      return {
        ...base,
        intencao: "executar_recompra",
        ferramenta: "enviar_whatsapp",
        acao: "Executar abordagem de recompra autorizada.",
        requer_aprovacao: false,
        nivel_usado: nivel,
      };
    case "mensagem_recebida":
      return {
        ...base,
        intencao: "interpretar_e_responder",
        // Nível 3 executa COM aprovação: envio direto só do 4 em diante.
        ferramenta: nivel <= 3 ? "gerar_abordagem" : "enviar_whatsapp",
        acao: "Interpretar mensagem e responder dentro da política.",
        requer_aprovacao: nivel <= 3,
        nivel_usado: nivel,
      };
    case "proposta_sem_resposta":
      return {
        ...base,
        intencao: "retomar_proposta",
        ferramenta: "agendar_followup",
        acao: "Proposta sem resposta há 48h — agendar follow-up.",
        requer_aprovacao: false,
        nivel_usado: nivel,
      };
    case "pedido_criado":
      return {
        ...base,
        intencao: "alimentar_erp",
        ferramenta: "criar_oportunidade",
        acao: "Pedido criado — atualizar oportunidade e cadeia (financeiro/expedição).",
        requer_aprovacao: false,
        nivel_usado: nivel,
      };
    case "pagamento_recebido":
      return {
        ...base,
        intencao: "conciliar",
        ferramenta: "nenhuma",
        acao: "Pagamento recebido — conciliar e liberar crédito.",
        requer_aprovacao: false,
        nivel_usado: nivel,
      };
  }
}
