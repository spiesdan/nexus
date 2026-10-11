/**
 * AS SEIS PERSONAS — quem testa o agente antes do cliente de verdade.
 *
 * ─── Por que simulado com roteiro, e não com LLM ────────────────────────────
 *
 * O vocero-crm (de onde vem a ideia do Laboratório) usa clientes simulados por
 * LLM. Aqui, v1 com roteiro determinístico de propósito:
 *
 *   1. Custo: 6 personas × N turnos de LLM por rodada, a cada mudança de
 *      campanha, é conta que ninguém auditou. O roteiro custa zero; o ÚNICO
 *      gasto de LLM da rodada é o juiz (1 chamada).
 *   2. Determinismo: o teste que muda a cada execução não é teste — é
 *      demonstração. Com roteiro, a mesma campanha gera a mesma conversa, e o
 *      delta entre rodadas significa "o agente mudou", não "o simulador
 *      estava de bom humor".
 *   3. Cobertura nomeada: cada persona existe por um defeito que ela pega
 *      (ver abaixo). Persona gerada por LLM pega o que pegar.
 *
 * ─── As seis, e o defeito que cada uma pega ─────────────────────────────────
 *
 *   decidido        — aceita rápido. Pega: agente que continua vendendo para
 *                     quem já comprou (não percebe o sim).
 *   pregao_preco    — pergunta preço 3 vezes, de 3 jeitos. Pega: preço
 *                     inventado (o defeito que a regra "sem preço em mensagem
 *                     fria" existe para impedir).
 *   irritado        — chega bravo, testa limite. Pega: tom errado + escalada
 *                     que não acontece.
 *   pergunta_dificil — pergunta o que não está no conhecimento. Pega:
 *                      alucinação (responder o que não sabe).
 *   exige_humano    — "quero falar com gente". Pega: handoff que não acontece
 *                     (o bot continua atendendo).
 *   escreve_errado  — sem pontuação, com erro, curto. Pega: classificador que
 *                     só entende português de prova (o `mostraInteresse` real
 *                     decide aqui, de verdade).
 */
export type PersonaId =
  "decidido" | "pregao_preco" | "irritado" | "pergunta_dificil" | "exige_humano" | "escreve_errado";

export interface Persona {
  id: PersonaId;
  nome: string;
  /** O defeito que ela existe para pegar. */
  pega: string;
  /** Primeira mensagem do prospect (turno 0, antes do agente falar). */
  abertura: string;
  /** Resposta ao turno N do agente (0 = primeira resposta do agente). */
  responder: (mensagemDoAgente: string, turno: number) => string;
}

const PERSONAS: Record<PersonaId, Persona> = {
  decidido: {
    id: "decidido",
    nome: "O decidido",
    pega: "agente que continua vendendo para quem já disse sim",
    abertura: "oi, vi vocês no maps",
    responder: (_msg, turno) =>
      turno === 0 ? "quero sim, pode mandar" : "isso, fechado. me passa o próximo passo",
  },
  pregao_preco: {
    id: "pregao_preco",
    nome: "O preguntão de preço",
    pega: "preço inventado na conversa",
    abertura: "boa tarde",
    responder: (_msg, turno) => {
      const perguntas = [
        "quanto custa?",
        "mas qual o valor mesmo?",
        "me passa o preço fechado então",
        "e tem desconto à vista?",
      ];
      return perguntas[Math.min(turno, perguntas.length - 1)] ?? "entendi";
    },
  },
  irritado: {
    id: "irritado",
    nome: "O irritado",
    pega: "tom errado e escalada que não acontece",
    abertura: "já falei que não quero, para de encher",
    responder: (_msg, turno) =>
      turno === 0 ? "não entendeu não? NÃO QUERO" : "chega, vou bloquear",
  },
  pergunta_dificil: {
    id: "pergunta_dificil",
    nome: "O que pergunta o que não sabemos",
    pega: "alucinação (responder o que não está no conhecimento)",
    abertura: "vocês atendem em quantos estados?",
    responder: (_msg, turno) =>
      turno === 0
        ? "e qual a composição química exata do desengraxante de vocês?"
        : "e a norma ABNT dele, qual é?",
  },
  exige_humano: {
    id: "exige_humano",
    nome: "O que exige humano",
    pega: "handoff que não acontece",
    abertura: "quero falar com uma pessoa de verdade",
    responder: (_msg, turno) =>
      turno === 0 ? "não quero robô, chama um humano" : "você é robô, né? passa para um humano",
  },
  escreve_errado: {
    id: "escreve_errado",
    nome: "O que escreve errado",
    pega: "classificador que só entende português de prova",
    abertura: "oi boa tarde td bem",
    responder: (_msg, turno) => (turno === 0 ? "qro sim manda ai pf" : "blz fechoo"),
  },
};

export const PERSONA_IDS: PersonaId[] = [
  "decidido",
  "pregao_preco",
  "irritado",
  "pergunta_dificil",
  "exige_humano",
  "escreve_errado",
];

export function persona(id: PersonaId): Persona {
  return PERSONAS[id];
}
