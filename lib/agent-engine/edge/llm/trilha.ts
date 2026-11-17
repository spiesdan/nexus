/**
 * A trilha do turno de IA — o que o modelo VIU e o que ele DEVOLVEU.
 *
 * ## Por que existe (P0, medido em 17/11/2026)
 *
 * `llm_calls` guardava tokens, custo, modelo e erro — e **nada do conteúdo**.
 * Quando o agente respondia errado, ou quando o operador perguntava "por que
 * ele disse isso?", a resposta não existia em lugar nenhum: a entrada já tinha
 * sido lida, o contexto montado (histórico + playbook + resultados de
 * ferramenta) era descartado, e a saída do modelo não era persistida.
 *
 * `ai_agent_runs` não resolvia: o motor de produção (`lib/agent-engine`) não
 * escreve nela — a própria rota de execuções lê `llm_calls` no lugar.
 *
 * ## Recorte, e por que ele é explícito
 *
 * Uma ferramenta pode devolver JSON enorme (busca de catálogo, histórico), e
 * uma linha de telemetria com megabytes estoura o INSERT e não cabe na tela.
 * Cada peça é cortada com o sufixo `…` — o corte é VISÍVEL, não silencioso, e
 * os limites estão nomeados abaixo.
 */
import type { ModelMessage } from "ai";

/** Uma peça de ferramenta/fonte. O texto do prompt tem limite próprio. */
export const LIMITE_DA_PECA = 2_000;
/** Cada mensagem do histórico, individualmente. */
export const LIMITE_DA_MENSAGEM = 20_000;
/** O system prompt inteiro (playbook + tools) — é grande por natureza. */
export const LIMITE_DO_SYSTEM = 100_000;
/** O conjunto de fontes citadas. */
export const LIMITE_DAS_FONTES = 20_000;

/** Serializa e corta, marcando o corte. Nunca lança: telemetria não derruba turno. */
export function recortar(valor: unknown, limite: number = LIMITE_DA_PECA): string {
  let texto: string;
  if (typeof valor === "string") {
    texto = valor;
  } else {
    try {
      texto = JSON.stringify(valor) ?? "";
    } catch {
      texto = String(valor);
    }
  }
  return texto.length > limite ? `${texto.slice(0, limite)}…` : texto;
}

export function systemDoTurno(system: unknown): string | null {
  if (system === undefined || system === null) return null;
  if (typeof system === "string") {
    return system.length > LIMITE_DO_SYSTEM ? `${system.slice(0, LIMITE_DO_SYSTEM)}…` : system;
  }
  return recortar(system, LIMITE_DO_SYSTEM);
}

/**
 * O contexto que o modelo viu — histórico + mensagem de entrada —, não só o
 * que o cliente digitou. É a diferença entre "o cliente escreveu X" e "o
 * modelo respondeu Y TENDO VISTO X, Z e o resumo W".
 */
export function mensagensDoTurno(messages: readonly ModelMessage[] | undefined): string | null {
  if (!messages || messages.length === 0) return null;
  const enxutas = messages.map((m) => {
    const msg = m as unknown as { role?: unknown; content?: unknown };
    return { role: msg.role ?? null, content: recortar(msg.content, LIMITE_DA_MENSAGEM) };
  });
  return JSON.stringify(enxutas);
}

interface PassoComFerramentas {
  toolCalls?: ReadonlyArray<{ toolName?: string; input?: unknown }>;
  toolResults?: ReadonlyArray<{ toolName?: string; output?: unknown }>;
  sources?: ReadonlyArray<unknown>;
}

/**
 * As FONTES consultadas: ferramenta, argumento de entrada e o que ela devolveu.
 * A busca de conhecimento do agente aparece aqui, com o trecho que voltou — é o
 * que responde "de onde ele tirou isso?".
 */
export function ferramentasDoTurno(steps: readonly PassoComFerramentas[]): string | null {
  const chamadas: Array<{ tool: string; input: string; output?: string }> = [];
  for (const step of steps) {
    for (const chamada of step.toolCalls ?? []) {
      chamadas.push({ tool: chamada.toolName ?? "?", input: recortar(chamada.input) });
    }
  }
  const resultados = steps.flatMap((s) => s.toolResults ?? []);
  resultados.forEach((resultado, i) => {
    const alvo = chamadas[i];
    if (alvo) {
      alvo.output = recortar(resultado.output);
    } else {
      // Resultado sem chamada correspondente (passo retomado de estado): não se
      // inventa input, mas o resultado é fonte e não pode sumir.
      chamadas.push({
        tool: resultado.toolName ?? "?",
        input: "",
        output: recortar(resultado.output),
      });
    }
  });
  return chamadas.length > 0 ? JSON.stringify(chamadas) : null;
}

/** Citações que o provedor devolveu (`result.sources`), quando ele as devolve. */
export function fontesDoTurno(steps: readonly PassoComFerramentas[]): string | null {
  const fontes = steps.flatMap((s) => s.sources ?? []);
  return fontes.length > 0 ? recortar(fontes, LIMITE_DAS_FONTES) : null;
}

export interface TrilhaDoTurno {
  prompt_system: string | null;
  prompt_messages: string | null;
  output_text: string | null;
  tool_calls: string | null;
  sources: string | null;
}

export function trilhaDoTurno(args: {
  system: unknown;
  messages: readonly ModelMessage[] | undefined;
  saida: string | undefined;
  steps: readonly PassoComFerramentas[];
}): TrilhaDoTurno {
  const saida = (args.saida ?? "").trim();
  return {
    prompt_system: systemDoTurno(args.system),
    prompt_messages: mensagensDoTurno(args.messages),
    // Saída vazia NÃO vira "": seria afirmar que o modelo respondeu nada.
    output_text: saida === "" ? null : saida,
    tool_calls: ferramentasDoTurno(args.steps),
    sources: fontesDoTurno(args.steps),
  };
}
