/**
 * O CAMINHO DE ENVIO COMPARTILHADO da prospecção.
 *
 * Antes desta função existia UMA forma de a prospecção mandar mensagem: o
 * `enviarPlano()` privado da rota `prospects/disparar`. O agendamento precisa
 * do MESMO envio (o tick manda uma mensagem por minuto), e um segundo caminho
 * de envio no produto é exatamente onde os guardrails divergem — um caminho
 * ganha a checagem nova, o outro não, e o defeito só aparece no número banido.
 *
 * Então a sequência vira UMA função, usada pelos dois:
 *
 *   1. `fn_upsert_wa_contact` — o contato é resolvido por telefone; não há
 *      segunda forma de "criar contato" neste produto (`p_notify` é o NOME DE
 *      EXIBIÇÃO, não um booleano).
 *   2. `ensureConversation` — abre (ou reusa) a conversa da sessão.
 *   3. `sendMessageHandler` — o caminho de saída canônico (o mesmo da UI, da
 *      automação, do MCP e do agente).
 *   4. `pacing_ledger` — registra o envio efetivado. É de onde sai o
 *      espaçamento GLOBAL por número do tick ("nunca duas no mesmo segundo",
 *      inclusive com duas campanhas ativas). Falha aqui NÃO derruba o envio:
 *      o ledger é o freio, e um freio que tranca o carro é pior que freio
 *      nenhum.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { ApiError } from "@/lib/api/types";
import { ensureConversation } from "@/lib/automation/start-conversation";
import { renderizarCorpoDoTemplate } from "@/lib/channels/templates/para-campanha";
import { logger } from "@/lib/logger";
import { interpolarValoresDoTemplate } from "@/lib/prospeccao/mensagem-da-campanha";

/** O mínimo do prospect que o envio precisa. */
export interface ProspectParaEnvio {
  id: string;
  nome: string;
  telefone_normalizado: string;
  /** Só para interpolar `{{cidade}}` no modelo. */
  cidade?: string | null;
  /** Só para interpolar `{{categoria}}` no modelo. */
  categoria?: string | null;
}

/**
 * O bind do modelo, já resolvido contra o espelho VIGENTE.
 *
 * `components` viaja junto porque a campanha já leu a linha para validar o
 * contrato; reler no envio criaria a janela em que o modelo muda entre a
 * validação e o POST — e o texto gravado no inbox divergiria do entregue.
 */
export interface TemplateDoEnvio {
  name: string;
  language: string;
  contractHash: string;
  values: Record<string, string>;
  components: unknown[];
  parameterFormat: string;
}

export interface ParametrosDoEnvio {
  orgId: string;
  /** Quem age no audit. `null` no cron (o agendamento não tem usuário logado). */
  usuarioId: string | null;
  requestId: string;
  sessaoId: string;
  prospect: ProspectParaEnvio;
  mensagem: string;
  /** Presente = o caminho é template; `mensagem` fica ignorada. */
  template?: TemplateDoEnvio | null;
  /** O carimbo em `pacing_ledger` — o instante chega por parâmetro no tick. */
  agoraIso?: string;
}

export type ResultadoDoEnvio =
  | { ok: true; messageId: string; status: string }
  | { ok: false; erro: string };

export async function enviarParaProspect(
  admin: SupabaseClient,
  p: ParametrosDoEnvio,
): Promise<ResultadoDoEnvio> {
  try {
    // O telefone vira o `chat_id` do canal. `telefone_normalizado` já está em
    // E.164 (`+55…`); o RPC quer só os dígitos.
    const chatId = p.prospect.telefone_normalizado.replace(/\D/g, "");
    const { data: contactId, error: errContato } = await admin.rpc("fn_upsert_wa_contact", {
      p_org: p.orgId,
      p_kind: "phone",
      p_phone: chatId,
      p_lid: null,
      p_chat_id: chatId,
      p_notify: p.prospect.nome,
    });
    if (errContato || !contactId) {
      return {
        ok: false,
        erro: errContato?.message ?? "Não foi possível criar o contato.",
      };
    }

    // `ensureConversation` devolve sempre um id ou lança — o throw cai no catch
    // abaixo e vira uma falha do item, sem parar a campanha.
    const conversationId = await ensureConversation(admin, p.orgId, contactId, p.sessaoId);

    // ── O caminho do template ─────────────────────────────────────────────
    // Os valores são interpolados POR PROSPECT e o corpo é renderizado com os
    // mesmos valores. `sendMessageHandler` recebe o texto que o cliente vai ler
    // como `body` — é o que faz os guardrails (promessa, spinning, disclosure)
    // enxergarem o template em vez de um ponto cego.
    let corpo = p.mensagem;
    let templateValues: Record<string, string> | null = null;
    if (p.template) {
      templateValues = interpolarValoresDoTemplate(p.template.values, {
        nome: p.prospect.nome,
        cidade: p.prospect.cidade ?? null,
        categoria: p.prospect.categoria ?? null,
      });
      corpo = renderizarCorpoDoTemplate(
        {
          components: p.template.components,
          name: p.template.name,
          language: p.template.language,
          parameterFormat: p.template.parameterFormat,
        },
        templateValues,
      ).trim();
      if (!corpo) {
        return {
          ok: false,
          erro:
            "template_sem_texto: o modelo não tem header/corpo de texto para exibir e validar. " +
            "Campanha por template nesta versão exige texto.",
        };
      }
    }

    const mensagem = await sendMessageHandler(
      admin,
      {
        organization_id: p.orgId,
        actor: p.usuarioId
          ? { type: "user", id: p.usuarioId }
          : { type: "webhook_source", id: "prospecting-send" },
        requestId: p.requestId,
      },
      p.template && templateValues
        ? {
            conversation_id: conversationId,
            type: "template",
            body: corpo,
            template_name: p.template.name,
            template_language: p.template.language,
            template_values: templateValues,
          }
        : { conversation_id: conversationId, type: "text", body: corpo },
    );

    // O handler grava `queued` quando o canal ainda não pode falar (credencial
    // ausente, sessão fora de WORKING) e `failed` quando a plataforma recusou.
    // Nenhum dos dois é "enviado": contar como sucesso consumiria a reserva e
    // limparia o erro da campanha sem nada ter chegado ao cliente.
    if (mensagem.status !== "sent") {
      const fila = mensagem.metadata?.queued_reason;
      const motivo =
        mensagem.error_message ??
        (typeof fila === "string" && fila.length > 0
          ? `Mensagem em fila: ${fila}.`
          : `Mensagem não enviada (${mensagem.status}).`);
      return { ok: false, erro: motivo };
    }

    // Espaçamento GLOBAL por número: sem esta linha o tick não tem de onde ler o
    // "último envio desta sessão" — e `espacarEnvio` (memória) não sobrevive ao
    // restart nem atravessa processos.
    try {
      await admin.from("pacing_ledger").insert({
        organization_id: p.orgId,
        channel_session_id: p.sessaoId,
        sent_at: p.agoraIso ?? new Date().toISOString(),
      });
    } catch (e) {
      logger.warn("[prospeccao.envio] pacing_ledger falhou (envio segue)", {
        organizationId: p.orgId,
        prospectId: p.prospect.id,
        erro: e instanceof Error ? e.message : String(e),
      });
    }

    return { ok: true, messageId: mensagem.id, status: mensagem.status };
  } catch (err) {
    return {
      ok: false,
      erro: err instanceof ApiError ? err.message : "Erro desconhecido.",
    };
  }
}
