/**
 * O AVISO ao cliente quando a rota SAI PARA A RUA — lado do CRM (`supabase-js`).
 *
 * Gatilho: `POST /api/v1/shipments/[id]/rota/iniciar` (o botão "Sair para
 * rota"), depois do update que vira a carga para `em_rota`. Antes ele saía na
 * criação da carga — quando o caminhão ainda estava na doca — e o texto tinha
 * que se explicar ("programada para sair"). O cliente não precisa da logística
 * interna; precisa saber que o pedido saiu para entrega.
 *
 * ─── A REGRA DURA: SÓ O NÚMERO DE EXPEDIÇÃO ───────────────────────────────
 *
 * Até 2026-11-09, se o número de expedição estivesse parado, o aviso caía no
 * comercial. O dono mediu o custo: a conta comercial via no inbox avisos de
 * rota que não são dela, e o cliente recebia a notificação no número em que
 * compra. Numa organização com dois números e duas contas separadas, esse
 * fallback destrói a separação que a tela promete.
 *
 * Agora o aviso só sai pelo canal marcado `finalidade = 'expedicao'`. Se ele
 * não existe ou não está `WORKING`, o FATO fica na fila durável
 * `shipment_notices` (uma linha por carga+pedido) e o cron
 * `expedition-notices` entrega quando a sessão voltar. Nada sai pelo comercial
 * — nem como último recurso.
 *
 * Por que a fila é uma tabela e não `messages.status='queued'`: o caminho de
 * envio grava `queued` quando a sessão não está pronta, mas NÃO existe drenagem
 * desse estado — a linha ficaria parada para sempre. E reenviar uma linha
 * `queued` exigiria reimplementar o envio num segundo lugar, que é exatamente
 * onde os guardrails divergem. A fila guarda o fato; o envio continua sendo o
 * caminho canônico (`sendMessageHandler`).
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
import {
  ensureConversation,
  sessaoParaAvisosDeExpedicao,
} from "@/lib/automation/start-conversation";
import { logger } from "@/lib/logger";
import { FUSO_PADRAO, fusoValido } from "@/lib/tempo/fusos";

/** Ator do envio — o sistema de expedição falando, não uma pessoa. */
const ATOR_DO_AVISO = "expedicao-aviso";

/**
 * Claim de um tick que morreu entre marcar `enviando` e concluir. Dez minutos é
 * maior que qualquer envio legítimo e menor que a paciência de quem espera o
 * aviso; sem reciclar, a linha ficaria `enviando` para sempre e o cliente nunca
 * saberia que o pedido saiu.
 */
const CLAIM_ORFAO_MS = 10 * 60 * 1000;

export interface AvisoDaCargaInput {
  organizationId: string;
  shipmentId: string;
  /** Os pedidos embarcados nesta carga (vazia = nada a avisar). */
  orderIds: readonly string[];
}

interface PedidoDaCarga {
  id: string;
  numero: number;
  contact_id: string | null;
}

interface AvisoPendente {
  id: string;
  organization_id: string;
  shipment_id: string;
  order_id: string;
  attempts: number;
}

export interface EntregarPendentesOpts {
  organizationId?: string;
  shipmentId?: string;
  limit?: number;
}

export interface EntregarPendentesResult {
  /** Avisos que saíram nesta rodada. */
  enviados: number;
  /** Avisos que tentaram com o número no ar e falharam (terminal). */
  falharam: number;
  /** Avisos que continuam esperando o número de expedição. */
  naFila: number;
}

const ZERO: EntregarPendentesResult = { enviados: 0, falharam: 0, naFila: 0 };

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

async function fusoDaOrganizacao(admin: SupabaseClient, orgId: string): Promise<string> {
  // O fuso que vale é o da organização — o servidor roda em UTC e "Bom dia"
  // às 3h da manhã é o defeito que este select evita. Falha aberta: fuso
  // inválido (a coluna não tem CHECK) cai no padrão do produto.
  const { data: org } = await admin
    .from("organizations")
    .select("timezone")
    .eq("id", orgId)
    .maybeSingle();
  const bruto = String((org as { timezone?: string | null } | null)?.timezone ?? "").trim();
  return bruto !== "" && fusoValido(bruto) ? bruto : FUSO_PADRAO;
}

async function carregarPedidos(
  admin: SupabaseClient,
  organizationId: string,
  orderIds: readonly string[],
): Promise<PedidoDaCarga[]> {
  if (orderIds.length === 0) return [];
  const { data, error } = await admin
    .from("commercial_orders")
    .select("id, numero, contact_id")
    .eq("organization_id", organizationId)
    .in("id", [...orderIds]);
  if (error) throw new Error(error.message);
  return (data as PedidoDaCarga[] | null) ?? [];
}

async function marcarAviso(
  admin: SupabaseClient,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await admin
    .from("shipment_notices")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
}

/**
 * Avisa o cliente de CADA pedido embarcado. Fire-and-forget por contrato:
 * nunca lança, e o erro de um pedido não impede os demais.
 *
 * Enfileira TODOS os pedidos antes de tentar enviar. O `unique
 * (shipment_id, order_id)` é o que impede aviso dobrado se a rota for
 * reiniciada ou se o cron rodar no mesmo instante.
 */
export async function avisarClientesDaCarga(
  admin: SupabaseClient,
  input: AvisoDaCargaInput,
): Promise<{ avisados: number }> {
  if (input.orderIds.length === 0) return { avisados: 0 };

  try {
    const pedidos = await carregarPedidos(admin, input.organizationId, input.orderIds);
    if (pedidos.length === 0) return { avisados: 0 };

    const { error } = await admin.from("shipment_notices").upsert(
      pedidos.map((p) => ({
        organization_id: input.organizationId,
        shipment_id: input.shipmentId,
        order_id: p.id,
      })),
      { onConflict: "shipment_id,order_id", ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);

    // Mesmo com o número fora do ar, a chamada é barata: a função devolve os
    // pendentes e LOGa que estão na fila. O cron entrega quando a sessão voltar.
    const resumo = await entregarAvisosPendentes(admin, {
      organizationId: input.organizationId,
      shipmentId: input.shipmentId,
      limit: 500,
    });
    return { avisados: resumo.enviados };
  } catch (err) {
    logger.warn("[expedicao-aviso] aviso da carga não saiu", {
      organization_id: input.organizationId,
      shipment_id: input.shipmentId,
      error: err instanceof Error ? err.message.slice(0, 200) : String(err),
    });
    return { avisados: 0 };
  }
}

/**
 * Entrega a fila de avisos pendentes das organizações cujo número de expedição
 * está `WORKING`. Chamada pelo cron `expedition-notices` a cada minuto e pelo
 * caminho da rota logo depois de enfileirar.
 *
 * O CLAIM é atômico: o UPDATE com `eq("status","pendente")` só vence um tick.
 * Se dois crons rodarem juntos, o segundo não encontra a linha `pendente` e
 * segue. Um claim órfão (processo morreu no meio) volta à fila após
 * `CLAIM_ORFAO_MS`.
 */
export async function entregarAvisosPendentes(
  admin: SupabaseClient,
  opts: EntregarPendentesOpts = {},
): Promise<EntregarPendentesResult> {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const agora = new Date();
  const agoraIso = agora.toISOString();

  // Recicla claim órfão antes de ler a fila.
  let reciclar = admin
    .from("shipment_notices")
    .update({
      status: "pendente",
      last_error: "claim_expirado",
      updated_at: agoraIso,
    })
    .eq("status", "enviando")
    .lt("updated_at", new Date(agora.getTime() - CLAIM_ORFAO_MS).toISOString());
  if (opts.organizationId) reciclar = reciclar.eq("organization_id", opts.organizationId);
  if (opts.shipmentId) reciclar = reciclar.eq("shipment_id", opts.shipmentId);
  const { error: reciclarErr } = await reciclar;
  if (reciclarErr) {
    logger.warn("[expedicao-aviso] reciclagem de claim falhou", {
      error: reciclarErr.message.slice(0, 200),
    });
  }

  let consulta = admin
    .from("shipment_notices")
    .select("id, organization_id, shipment_id, order_id, attempts")
    .eq("status", "pendente")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (opts.organizationId) consulta = consulta.eq("organization_id", opts.organizationId);
  if (opts.shipmentId) consulta = consulta.eq("shipment_id", opts.shipmentId);
  const { data, error } = await consulta;
  if (error) throw new Error(`shipment_notices_query_failed: ${error.message}`);

  const pendentes = (data as AvisoPendente[] | null) ?? [];
  if (pendentes.length === 0) return ZERO;

  const porOrg = new Map<string, AvisoPendente[]>();
  for (const aviso of pendentes) {
    porOrg.set(aviso.organization_id, [...(porOrg.get(aviso.organization_id) ?? []), aviso]);
  }

  let enviados = 0;
  let falharam = 0;
  let naFila = 0;

  for (const [orgId, avisos] of porOrg) {
    const sessao = await sessaoParaAvisosDeExpedicao(admin, orgId);
    if (!sessao) {
      naFila += avisos.length;
      // O cron roda a cada minuto: logar a espera em todo tick encheria o log
      // de 1.440 linhas/dia dizendo "ainda não". Quem cria o aviso (a rota)
      // registra a espera uma vez; o cron só fala quando ENTREGA ou falha.
      if (opts.shipmentId) {
        logger.warn("[expedicao-aviso] sem número de expedição marcado — aviso(s) na fila", {
          organization_id: orgId,
          pendentes: avisos.length,
        });
      }
      continue;
    }
    if (sessao.status !== "WORKING") {
      naFila += avisos.length;
      if (opts.shipmentId) {
        logger.info("[expedicao-aviso] número de expedição fora do ar — aviso(s) na fila", {
          organization_id: orgId,
          channel_session_id: sessao.id,
          status: sessao.status,
          pendentes: avisos.length,
        });
      }
      continue;
    }

    const fuso = await fusoDaOrganizacao(admin, orgId);
    const saudacaoDoMomento = saudacao(agora, fuso);
    const pedidos = await carregarPedidos(
      admin,
      orgId,
      avisos.map((a) => a.order_id),
    );
    const porPedido = new Map(pedidos.map((p) => [p.id, p]));

    for (const aviso of avisos) {
      const pedido = porPedido.get(aviso.order_id);
      if (!pedido || !pedido.contact_id) {
        await marcarAviso(admin, aviso.id, {
          status: "falhou",
          last_error: "pedido_sem_contato",
        });
        falharam++;
        continue;
      }

      const { data: claim } = await admin
        .from("shipment_notices")
        .update({
          status: "enviando",
          attempts: aviso.attempts + 1,
          last_error: null,
          updated_at: agoraIso,
        })
        .eq("id", aviso.id)
        .eq("status", "pendente")
        .select("id")
        .maybeSingle();
      if (!claim) continue; // outro tick pegou

      try {
        const conversationId = await ensureConversation(
          admin,
          orgId,
          pedido.contact_id,
          sessao.id,
        );
        const mensagem = await sendMessageHandler(
          admin,
          {
            organization_id: orgId,
            actor: { type: "ai_agent", id: ATOR_DO_AVISO, role: "manager" },
            requestId: `expedicao-aviso:${aviso.shipment_id}:${pedido.id}`,
          },
          {
            conversation_id: conversationId,
            type: "text",
            body: textoDoAviso(pedido.numero, saudacaoDoMomento),
            // A linha se DECLARA — mesma razão do aviso de escalação: quem
            // audita a conversa depois precisa separar sistema de fala humana
            // ou de agente.
            metadata: {
              aviso_de_expedicao: true,
              shipment_id: aviso.shipment_id,
              order_id: pedido.id,
            },
          },
        );

        if (mensagem.status === "queued") {
          // A sessão deixou de estar pronta entre o claim e o envio. Volta para
          // a fila; o próximo tick tenta de novo quando ela voltar.
          await marcarAviso(admin, aviso.id, {
            status: "pendente",
            last_error: "channel_session_not_working",
          });
          naFila++;
        } else if (mensagem.status === "failed") {
          await marcarAviso(admin, aviso.id, {
            status: "falhou",
            message_id: mensagem.id,
            last_error:
              mensagem.error_code ?? mensagem.error_message ?? "send_failed",
          });
          falharam++;
        } else {
          // `sent` E `sending` contam como enviado: `sending` significa que o
          // transporte ACEITOU e o ack ainda não chegou. Reenviar por causa do
          // ack pendente mandaria a mesma mensagem duas vezes ao cliente — o
          // desfecho real da mensagem quem conta é a linha de `messages`.
          await marcarAviso(admin, aviso.id, {
            status: "enviado",
            message_id: mensagem.id,
            sent_at: new Date().toISOString(),
            last_error: null,
          });
          enviados++;
        }
      } catch (err) {
        // PII fora do log: só a razão. Contato bloqueado/anonimizado cai aqui
        // e não pode parar o aviso do pedido seguinte.
        //
        // Erro INESPERADO (rede, storage, banco) ganha até 3 tentativas: o
        // claim já contou esta. Depois disso vira terminal — insistir para
        // sempre num contato bloqueado é ruído, não recuperação.
        const tentativa = aviso.attempts + 1;
        const transitorio = tentativa < 3;
        await marcarAviso(admin, aviso.id, {
          status: transitorio ? "pendente" : "falhou",
          last_error: err instanceof Error ? err.message.slice(0, 200) : String(err),
        });
        if (transitorio) naFila++;
        else falharam++;
        logger.warn("[expedicao-aviso] aviso de pedido não saiu", {
          organization_id: orgId,
          shipment_id: aviso.shipment_id,
          tentativa,
          error: err instanceof Error ? err.message.slice(0, 200) : String(err),
        });
      }
    }
  }

  return { enviados, falharam, naFila };
}
