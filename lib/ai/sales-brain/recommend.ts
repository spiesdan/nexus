import type { HistoricoCompra } from "@/lib/comercial/radar-compras";

/**
 * NEXUS Sales Brain — recomendações operacionais sobre dados reais.
 *
 * NEXUS 2.0 §26–§27: o Brain responde QUEM/PORQUÊ/QUANDO/O-QUÊ/COMO/próximo
 * passo. Função pura sobre `HistoricoCompra` (lib/comercial/radar-compras.ts):
 * sem I/O, sem mock, testável. Quem chama carrega pedidos reais e passa aqui.
 */

export type BrainPrioridade = "alta" | "media" | "baixa";

export type BrainAcao = "ver_cliente" | "criar_pedido" | "whatsapp" | "aprovar_ia";

export interface BrainRecomendacao {
  contact_id: string;
  prioridade: BrainPrioridade;
  motivo: string;
  recomendacao: string;
  proxima_acao: BrainAcao;
  situacao: HistoricoCompra["situacao"];
  dias_sem_compra: number;
  atraso_dias: number;
  intervalo_mediano_dias: number | null;
  ultima_compra: string;
  ticket_medio_cents: number;
}

function prioridadeDe(h: HistoricoCompra): BrainPrioridade {
  if (h.situacao === "em_risco" || h.situacao === "recompra_atrasada") return "alta";
  if (h.situacao === "em_voo" || h.situacao === "oportunidade_aberta") return "media";
  if (h.situacao === "cancelado_sem_nova") return "media";
  if (h.situacao === "primeira_compra") return "baixa";
  return "baixa";
}

function proximaAcaoDe(h: HistoricoCompra): BrainAcao {
  if (h.situacao === "em_voo") return "ver_cliente";
  if (h.situacao === "oportunidade_aberta") return "criar_pedido";
  if (h.atraso_dias > 0) return "whatsapp";
  return "ver_cliente";
}

/** Uma recomendação por cliente. `hoje` só aparece no texto quando cita atraso. */
export function recomendar(h: HistoricoCompra): BrainRecomendacao | null {
  if (h.situacao === "ok" || h.situacao === "novo_sem_compras") return null;
  const ciclo = h.intervalo_mediano_dias ?? h.intervalo_medio_dias;
  const motivo =
    ciclo != null
      ? `Última compra há ${h.dias_sem_compra} dias; ciclo mediano ${ciclo} dias (atraso ${h.atraso_dias} dias).`
      : `Última compra há ${h.dias_sem_compra} dias; sem ciclo medido (${h.qtd_pedidos} compra(s)).`;
  const recomendacao =
    h.situacao === "em_voo"
      ? "Há pedido em voo — acompanhar antes de ofertar de novo."
      : h.situacao === "oportunidade_aberta"
        ? "Há orçamento em aberto — retomar a proposta."
        : h.situacao === "cancelado_sem_nova"
          ? "Cancelou sem nova compra — entender o motivo e recuperar."
          : h.situacao === "primeira_compra"
            ? "Primeira compra registrada — apresentar recorrentes da categoria."
            : "Fazer contato de recompra.";
  return {
    contact_id: h.contact_id,
    prioridade: prioridadeDe(h),
    motivo,
    recomendacao,
    proxima_acao: proximaAcaoDe(h),
    situacao: h.situacao,
    dias_sem_compra: h.dias_sem_compra,
    atraso_dias: h.atraso_dias,
    intervalo_mediano_dias: h.intervalo_mediano_dias,
    ultima_compra: h.ultima_compra,
    ticket_medio_cents: h.ticket_medio_cents,
  };
}

/** Ordena: alta → media → baixa, depois maior atraso. */
export function ordenarRecomendacoes(rs: BrainRecomendacao[]): BrainRecomendacao[] {
  const peso: Record<BrainPrioridade, number> = { alta: 0, media: 1, baixa: 2 };
  return [...rs].sort((a, b) => peso[a.prioridade] - peso[b.prioridade] || b.atraso_dias - a.atraso_dias);
}
