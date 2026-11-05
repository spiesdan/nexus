/**
 * O AVISO ao cliente quando a rota SAI PARA A RUA — lado do CRM (`supabase-js`).
 *
 * Gatilho: `POST /api/v1/shipments/[id]/rota/iniciar` (o botão "Sair para
 * rota"), depois do update que vira a carga para `em_rota`. Antes ele saía na
 * criação da carga — quando o caminhão ainda estava na doca — e o texto tinha
 * que se explicar ("programada para sair"). O cliente não precisa da logística
 * interna; precisa saber que o pedido saiu para entrega.
 *
 * É o MESMO encanamento do aviso de escalação (`lib/ai/handoff/aviso-ao-lead.ts`):
 * `sendMessageHandler` com ator declarado e metadata que identifica o aviso
 * como sistema, fire-and-forget com catch por pedido. A função NUNCA lança —
 * um envio que falhou não pode derrubar a resposta da rota que já foi
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
import { FUSO_PADRAO, fusoValido } from "@/lib/tempo/fusos";

/** Ator do envio — o sistema de expedição falando, não uma pessoa. */
const ATOR_DO_AVISO = "expedicao-aviso";

export interface AvisoDaCargaInput {
  organizationId: string;
  shipmentId: string;
  /** Os pedidos embarcados nesta carga (vazia = nada a avisar). */
  orderIds: readonly string[];
}

/**
 * Saudação pelo relógio da ORGANIZAÇÃO (não do servidor, que roda em UTC).
 *
 * Cortes 5/12/18 são apresentação, não regra de negócio — os mesmos da home
 * do produto (`app/app/_home.tsx`). Madrugada cai em "Boa noite": ninguém
 * quer receber "Bom dia" às 3h.
 */
export function saudacao(agora: Date, fuso: string): string {
  // "en-US" aqui NÃO é idioma de tela: é a forma estável de pedir ao Intl só o
  // NÚMERO da hora de parede no fuso (mesmo padrão de
  // `lib/agent-engine/agent/janela-de-atendimento.ts` e `pacing/engine.ts`). A
  // data formatada com idioma quem escolhe é a camada `lib/i18n/datas.ts` — o
  // guarda `tests/unit/i18n-a-data-segue-o-idioma.test.ts` reprova "pt-BR"
  // fixo justamente porque aquilo viraria texto na tela; aqui o resultado é
  // convertido em número e nunca chega ao cliente.
  // `% 24`: algumas ICUs devolvem "24" à meia-noite com hour12:false.
  const hora =
    Number(
      new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        hour12: false,
        timeZone: fuso,
      }).format(agora),
    ) % 24;
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * O texto do aviso. Comercial e curto: saudação + o fato que interessa.
 * Sem prazo prometido, sem jargão de expedição (carga, separação, romaneio).
 */
export function textoDoAviso(numeroPedido: number, saudacaoDoMomento: string): string {
  const pedido = `PED-${String(numeroPedido).padStart(4, "0")}`;
  return (
    `${saudacaoDoMomento}! Seu pedido ${pedido} saiu para entrega. 🚚 ` +
    "Em breve ele chega até você. Qualquer dúvida, é só responder por aqui."
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

    // O fuso que vale é o da organização — o servidor roda em UTC e "Bom dia"
    // às 3h da manhã é o defeito que este select evita. Falha aberta: fuso
    // inválido (a coluna não tem CHECK) cai no padrão do produto.
    const { data: org } = await admin
      .from("organizations")
      .select("timezone")
      .eq("id", input.organizationId)
      .maybeSingle();
    const fusoBruto = String((org as { timezone?: string | null } | null)?.timezone ?? "").trim();
    const fuso = fusoBruto !== "" && fusoValido(fusoBruto) ? fusoBruto : FUSO_PADRAO;
    const saudacaoDoMomento = saudacao(new Date(), fuso);

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
            body: textoDoAviso(p.numero, saudacaoDoMomento),
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
