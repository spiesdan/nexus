/**
 * A IA DE PROSPECÇÃO FALA UMA VEZ.
 *
 * ─── O que este arquivo resolve ──────────────────────────────────────────────
 *
 * O pedido original: "a IA de prospecção deve ser responsável somente pelo
 * primeiro contato comercial. Após a primeira mensagem de prospecção, a conversa
 * deve seguir o fluxo de atendimento definido no sistema."
 *
 * O mecanismo já existia inteiro: `conversations.bot_silenced_until` pausa a
 * automação, e `motor.ts` já LÊ esse campo antes de mandar follow-up — a linha
 * `humano_assumiu` está lá, com o evento registrado.
 *
 * O que não existia era **quem cala o bot**. O campo era escrito só por
 * Menschen que assumem a conversa de mão (`conversations/[id]/close`), e a fila
 * de venda automática só CLASSIFICAVA a resposta do prospect — nenhuma das duas
 * coisas é "o prospect respondeu com interesse".
 *
 * ─── Por que calar e não só parar de fazer follow-up ────────────────────────
 *
 * Porque a venda automática não é a única coisa que responde. O dispatcher de IA
 * atende a conversa inteira; se só a fila de follow-up parar, a IA continua
 * respondendo como atendente — que é exatamente o defeito relatado.
 *
 * ─── O que NÃO é silenced: a campanha ────────────────────────────────────────
 *
 * A linha da fila muda para `responded` e o follow-up para `null`. A campanha
 * continua: o prospect que respondeu é um lead quente, e descartar a campanha
 * seria perder informação que a pessoa comprou.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

/**
 * Quanto tempo a IA fica calada depois do interesse.
 *
 * Curto de propósito. O pedido original diz que depois do primeiro contato a
 * conversa "segue o fluxo de atendimento definido no sistema" — e um silêncio
 * longo seria um bot calado que ninguém sabe se está lá, não um bot que passou a
 * bola. Uma hora é o bastante para a pessoa chegar e ver a conversa.
 */
export const SILENCIO_APOS_INTERESSE_MS = 60 * 60 * 1000;

/** As razões pelas quais a IA cala. O motivo fica registrado. */
export type MotivoDoSilencio = "interesse_na_prospeccao";

/**
 * A conversa mostra INTERESSE?
 *
 * ─── O que esta função se recusa a fazer ───────────────────────────────────
 *
 * Ela não adivinha por palavra-chave solta. Um "ok" e um "boa tarde" aparecem em
 * conversa que não é de venda; tratar qualquer um deles como interesse cala a IA
 * em conversa que ela estava atendendo bem, e o operador recebe um bot calado sem
 * saber por quê.
 *
 * O piso é o TAMANHO da resposta: uma pessoa que escreve uma frase inteira está
 * ali. E há recusas explícitas, porque "não tenho interesse" e "não" no começo
 * de uma frase são as duas respostas que mais calariam a IA à toa.
 */
export function mostraInteresse(texto: string | null | undefined): boolean {
  if (!texto) return false;
  const plano = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  if (plano.length < 12) return false;

  // Recusa primeiro: uma recusa longa ("infelizmente nao tenho interesse nesse
  // momento") passa do piso de tamanho e tem a palavra que decide.
  if (
    /(^|\W)(nao|nao tenho|sem interesse|nao quero|deixa pra depois|por enquanto nao|nao agora|cancela|nao faz sentido)(\W|$)/.test(
      plano,
    )
  ) {
    return false;
  }

  const interesse =
    /(^|\W)(quero|interesse|interessado|interessada|gostei|excelente|perfeito|boa|sim|pode ser|envia|manda|aceito|fechado|fechamos|top|show|maravilhoso|otimo|otima|claro)(\W|$)/;
  // "boa" e "claro" sozinhos são fracos: aparecem em "boa tarde" e "claro, pode
  // ser" — o segundo é interesse de verdade e o primeiro não. Exigir o resto da
  // frase depois deles é o que separa.
  if (/(^|\W)(boa tarde|bom dia|boa noite|ola|oi|opa|e ai)(\W|$)/.test(plano)) return false;
  return interesse.test(plano);
}

/** A conversa já está calada, para qualquer motivo? */
export function jaEstaCalada(
  botSilencedUntil: string | null | undefined,
  agora = Date.now(),
): boolean {
  if (botSilencedUntil === "infinity") return true;
  if (!botSilencedUntil) return false;
  const t = Date.parse(botSilencedUntil);
  return Number.isFinite(t) && t > agora;
}

/**
 * Cala a IA na conversa e devolve o novo valor.
 *
 * Estende o silêncio existente em vez de sobrescrever: se alguém já estendeu
 * para 3 horas, uma nova resposta do prospect não deve ENCURTAR o silêncio que
 * alguém com mais contexto definiu.
 */
export function novoSilencio(atual: string | null | undefined, agora: number = Date.now()): string {
  const fim = agora + SILENCIO_APOS_INTERESSE_MS;
  if (atual === "infinity") return "infinity";
  const t = atual ? Date.parse(atual) : Number.NaN;
  if (Number.isFinite(t) && t > fim) return atual as string;
  return new Date(fim).toISOString();
}

export interface ResultadoDoSilencio {
  conversou: boolean;
  conversaId: string | null;
  motivo: MotivoDoSilencio | null;
}

/**
 * Cala a IA de uma conversa de prospecção, se o prospect mostrou interesse.
 *
 * Idempotente: chamar de novo com a mesma conversa não muda nada e devolve
 * `conversou: false` — que é o que a fila de follow-up usa para não registrar
 * o mesmo evento três vezes em três ticks.
 */
export async function silenciarPorInteresse(
  admin: SupabaseClient,
  args: {
    organizationId: string;
    conversationId: string;
    /** O que o prospect respondeu. Ausente = calar mesmo assim (a fila ja viu). */
    corpo?: string | null;
    motivo?: MotivoDoSilencio;
  },
): Promise<ResultadoDoSilencio> {
  const { organizationId, conversationId } = args;

  // O corpo decide. Sem ele nao se cala: calar a IA por causa de uma conversa
  // cujo texto nao esta a vista e chutar.
  if (args.corpo !== undefined && !mostraInteresse(args.corpo)) {
    return { conversou: false, conversaId: conversationId, motivo: null };
  }

  const { data, error } = await admin
    .from("conversations")
    .select("bot_silenced_until")
    .eq("organization_id", organizationId)
    .eq("id", conversationId)
    .maybeSingle();
  if (error) {
    logger.error("[prospeccao.silenciar] leitura falhou", {
      error: error.message,
      conversaId: conversationId,
    });
    return { conversou: false, conversaId: conversationId, motivo: null };
  }

  const atual =
    (data as unknown as { bot_silenced_until: string | null } | null)?.bot_silenced_until ?? null;
  if (jaEstaCalada(atual)) {
    return { conversou: false, conversaId: conversationId, motivo: null };
  }

  const silencio = novoSilencio(atual);
  const { error: erroUpdate } = await admin
    .from("conversations")
    .update({ bot_silenced_until: silencio })
    .eq("organization_id", organizationId)
    .eq("id", conversationId);
  if (erroUpdate) {
    logger.error("[prospeccao.silenciar] update falhou", {
      error: erroUpdate.message,
      conversaId: conversationId,
    });
    return { conversou: false, conversaId: conversationId, motivo: null };
  }

  return {
    conversou: true,
    conversaId: conversationId,
    motivo: args.motivo ?? "interesse_na_prospeccao",
  };
}
