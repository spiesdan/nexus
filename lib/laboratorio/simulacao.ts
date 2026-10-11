/**
 * A SIMULAÇÃO — a conversa que nunca aconteceu.
 *
 * ─── O que isto roda, e o que NUNCA roda aqui ───────────────────────────────
 *
 * Roda: N turnos de (mensagem do agente → resposta da persona), com o gerador
 * de mensagem INJETADO. Em produção, o injetado é o `gerarAbordagem` real (o
 * mesmo que escreve a primeira mensagem fria); em teste, um fake.
 *
 * NUNCA roda aqui: `sendMessageHandler`, `ensureConversation`, qualquer
 * `insert` em `conversations`/`messages`. A prova é estrutural — este módulo
 * não importa nada que envie — e o teste `nunca_envia_mensagem_de_verdade`
 * quebra se alguém importar o sender no futuro.
 *
 * ─── Por que o agente começa ────────────────────────────────────────────────
 *
 * Porque é o que acontece na prospecção: o agente fala primeiro (mensagem
 * fria) e o prospect reage. A abertura da persona é o contexto ("oi, vi vocês
 * no maps"), não a primeira fala.
 */
import { persona, type PersonaId } from "./personas";

export interface Turno {
  /** Quem falou. */
  de: "agente" | "prospect";
  texto: string;
}

export interface TranscricaoSimulada {
  persona: PersonaId;
  campanha: { nome: string; perfil: string | null };
  turnos: Turno[];
  /** Por que parou. */
  parada: "turnos_esgotados" | "persona_saiu" | "agente_calou";
}

/** O que o harness precisa do gerador: texto puro, nunca envio. */
export type GerarMensagem = (args: {
  historico: Turno[];
  turno: number;
}) => Promise<{ ok: true; texto: string } | { ok: false; motivo: string }>;

const MAX_TURNOS = 6;

/** Sinais de que a persona saiu da conversa (para de responder). */
const SINAIS_DE_SAIDA = [/vou bloquear/i, /chega/i, /não quero/i];

export async function simularConversa(args: {
  personaId: PersonaId;
  campanhaNome: string;
  campanhaPerfil: string | null;
  gerar: GerarMensagem;
  maxTurnos?: number;
}): Promise<TranscricaoSimulada> {
  const p = persona(args.personaId);
  // A abertura entra como contexto (o agente "viu" o que o prospect disse ao
  // chegar), não como turno: o agente fala primeiro, como na prospecção real.
  const turnos: Turno[] = [{ de: "prospect", texto: p.abertura }];
  const max = Math.max(1, Math.min(args.maxTurnos ?? MAX_TURNOS, MAX_TURNOS));

  for (let turno = 0; turno < max; turno++) {
    const gerada = await args.gerar({ historico: turnos, turno });
    if (!gerada.ok) {
      return {
        persona: args.personaId,
        campanha: { nome: args.campanhaNome, perfil: args.campanhaPerfil },
        turnos,
        parada: "agente_calou",
      };
    }
    turnos.push({ de: "agente", texto: gerada.texto });

    const resposta = p.responder(gerada.texto, turno);
    turnos.push({ de: "prospect", texto: resposta });

    if (SINAIS_DE_SAIDA.some((s) => s.test(resposta))) {
      return {
        persona: args.personaId,
        campanha: { nome: args.campanhaNome, perfil: args.campanhaPerfil },
        turnos,
        parada: "persona_saiu",
      };
    }
  }

  return {
    persona: args.personaId,
    campanha: { nome: args.campanhaNome, perfil: args.campanhaPerfil },
    turnos,
    parada: "turnos_esgotados",
  };
}
