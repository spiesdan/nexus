/**
 * O AVISO ao cliente quando a carga nasce — lado do CRM (`supabase-js`).
 *
 * Gatilho: `POST /api/v1/shipments`, depois do insert das linhas de carga.
 * O pedido passa de `aprovado/faturado` para `expedido` ali dentro, e quem
 * espera a entrega tem direito de saber que ela começou — sem esperar o
 * cliente perguntar "e meu pedido?".
 *
 * É o MESMO encanamento do aviso de escalação (`lib/ai/handoff/aviso-ao-lead.ts`):
 * `sendMessageHandler` com ator declarado e metadata que identifica o aviso
 * como sistema, fire-and-forget com catch por pedido. A função NUNCA lança —
 * um envio que falhou não pode derrubar a criação da carga que já foi
 * auditada e respondida.
 *
 * O que este caminho NÃO cobre (dito como no aviso de escalação): janela/
 * throttle anti-ban e o restante da cadeia de envio do motor. O que NÃO se
 * perde é a trava dura: `sendMessageHandler` recusa contato `is_blocked`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { ensureConversation, sessaoProntaParaEnvio } from "@/lib/automation/start-conversation";
import { logger } from "@/lib/logger";

/** Ator do envio — o sistema de expedição falando, não uma pessoa. */
const ATOR_DO_AVISO = "expedicao-aviso";

export interface AvisoDaCargaInput {
  organizationId: string;
  shipmentId: string;
  shipmentNumero: number;
  /** Os pedidos embarcados nesta carga (vazia = nada a avisar). */
  orderIds: readonly string[];
}

/**
 * O texto do aviso. Sem promessa de prazo (regra dura do produto): diz o que
 * ACONTECEU — o pedido embarcou — e não quando chega.
 */
function textoDoAviso(numeroPedido: number, cargaNumero: number): string {
  const pedido = `PED-${String(numeroPedido).padStart(4, "0")}`;
  return (
    `Boa notícia: o seu pedido ${pedido} foi separado e entrou na carga nº ${cargaNumero}, ` +
    "que é a programada para sair para a entrega. Assim que a entrega for concluída, " +
    "o pedido é atualizado como entregue por aqui. Qualquer dúvida, é só responder nesta conversa."
  );
}

/**
 * Avisa o cliente de CADA pedido embarcado. Fire-and-forget por contrato:
 * nunca lança, e o erro de um pedido não impede os demais.
 *
 * Retorna quantos avisos saíram — para o teste e para o log, não para a rota
 * decidir alguma coisa com isso.
 */
export async function avisarClientesDaCarga(
  admin: SupabaseClient,
  input: AvisoDaCargaInput,
): Promise<{ avisados: number }> {
  if (input.orderIds.length === 0) return { avisados: 0 };

  try {
    const { data: pedidos, error } = await admin
      .from("commercial_orders")
      .select("id, numero, contact_id")
      .eq("organization_id", input.organizationId)
      .in("id", input.orderIds)
      .not("contact_id", "is", null);
    if (error) throw new Error(error.message);
    if (!pedidos || pedidos.length === 0) return { avisados: 0 };

    const sessionId = await sessaoProntaParaEnvio(admin, input.organizationId);
    if (!sessionId) {
      logger.warn("[expedicao-aviso] sem sessão de canal — aviso pulado", {
        organization_id: input.organizationId,
        shipment_id: input.shipmentId,
      });
      return { avisados: 0 };
    }

    let avisados = 0;
    for (const p of pedidos as Array<{ id: string; numero: number; contact_id: string }>) {
      try {
        const conversationId = await ensureConversation(
          admin,
          input.organizationId,
          p.contact_id,
          sessionId,
        );
        await sendMessageHandler(
          admin,
          {
            organization_id: input.organizationId,
            actor: { type: "ai_agent", id: ATOR_DO_AVISO, role: "manager" },
            requestId: `expedicao-aviso:${input.shipmentId}:${p.id}`,
          },
          {
            conversation_id: conversationId,
            type: "text",
            body: textoDoAviso(p.numero, input.shipmentNumero),
            // A linha se DECLARA — mesma razão do aviso de escalação: quem
            // audita a conversa depois precisa separar sistema de fala humana
            // ou de agente.
            metadata: {
              aviso_de_expedicao: true,
              shipment_id: input.shipmentId,
              order_id: p.id,
            },
          },
        );
        avisados++;
      } catch (err) {
        // PII fora do log: só a razão. Contato bloqueado/anonimizado cai aqui
        // e não pode parar o aviso do pedido seguinte.
        logger.warn("[expedicao-aviso] aviso de pedido não saiu", {
          organization_id: input.organizationId,
          shipment_id: input.shipmentId,
          error: err instanceof Error ? err.message.slice(0, 200) : String(err),
        });
      }
    }
    return { avisados };
  } catch (err) {
    logger.warn("[expedicao-aviso] aviso da carga não saiu", {
      organization_id: input.organizationId,
      shipment_id: input.shipmentId,
      error: err instanceof Error ? err.message.slice(0, 200) : String(err),
    });
    return { avisados: 0 };
  }
}
