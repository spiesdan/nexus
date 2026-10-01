/**
 * A timeline da Venda Automática (spec 18 §22): a fila É auditável — toda
 * transição de estado vira linha em `automatic_sales_events`.
 *
 * Nunca lança: um evento que não grava não pode derrubar o envio que acabou de
 * dar certo (a informação perde para a ação; o logger leva a causa).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

/** Vocabulário de eventos — validado na aplicação (a coluna é texto aberto). */
export const EVENTOS_DA_VA = [
  "selecionada",
  "rejeitada",
  "contato_encontrado",
  "contato_criado",
  "mensagem_enviada",
  "mensagem_falhou",
  "resposta_recebida",
  "interesse_classificado",
  "lead_criado",
  "oportunidade_criada",
  "followup_enviado",
  "sem_resposta",
  "ignorada",
  "bloqueado",
  "humano_assumiu",
  "reenfileirada",
] as const;

export type EventoDaVa = (typeof EVENTOS_DA_VA)[number];

export interface EventoParaRegistrar {
  organizationId: string;
  campaignId: string;
  /** null = evento da campanha (ex.: seleção em massa). */
  queueId?: string | null;
  tipo: EventoDaVa;
  payload?: Record<string, unknown>;
}

export async function registrarEvento(
  admin: SupabaseClient,
  evento: EventoParaRegistrar,
): Promise<void> {
  const { error } = await admin.from("automatic_sales_events").insert({
    organization_id: evento.organizationId,
    campaign_id: evento.campaignId,
    queue_id: evento.queueId ?? null,
    event_type: evento.tipo,
    payload: evento.payload ?? {},
  });
  if (error) {
    logger.warn("[venda-automatica] evento não gravado", {
      organizationId: evento.organizationId,
      campaignId: evento.campaignId,
      tipo: evento.tipo,
      causa: error.message,
    });
  }
}
