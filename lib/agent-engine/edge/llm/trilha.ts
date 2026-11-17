/**
 * A trilha do turno de IA — ESTRUTURA e HASH, nunca o conteúdo da conversa.
 *
 * ## Por que assim (P0-4, e a correção que o gate cobrou)
 *
 * `llm_calls` guardava tokens, custo, modelo e erro — e nada que explicasse a
 * resposta. A primeira versão desta trilha gravou prompt e saída **crus** e foi
 * reprovada pelo invariante do repo (`tests/unit/llm-calls-registra-falha.test.ts`,
 * "o conteúdo da conversa não vai junto"): conteúdo de mensagem é PII e não entra
 * em telemetria. O invariante está certo — log é o lugar de onde dado pessoal
 * vaza em auditoria de acesso e sobrevive à anonimização.
 *
 * A trilha mantém o que permite AUDITAR sem copiar o dado:
 *
 *   · hash do system efetivo → prova de qual política foi usada (o playbook é
 *     versionado, então o hash correlaciona);
 *   · meta das mensagens → quantas, de que papéis, com que tamanho, e o hash do
 *     conjunto. É o CONTEXTO em forma verificável;
 *   · hash/tamanho da saída → distingue resposta vazia de truncada;
 *   · ferramentas por hash → quais fontes foram consultadas e o tamanho do que
 *     voltou, sem duplicar o trecho;
 *   · fontes agregadas → total e hosts, sem título nem URL completa.
 *
 * Correlação sem cópia: o hash da mensagem de entrada casa com a linha em
 * `messages` do mesmo turno; quem pode ler a conversa confere ali. A telemetria
 * sozinha não devolve PII nem sob ordem de acesso a log.
 */
import { createHash } from "node:crypto";

import type { ModelMessage } from "ai";

function hash(valor: unknown): string {
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
  return createHash("sha256").update(texto, "utf8").digest("hex");
}

export function hashDoSystem(system: unknown): string | null {
  if (system === undefined || system === null) return null;
  if (typeof system === "string" && system.trim() === "") return null;
  return hash(system);
}

export interface MetaDasMensagens {
  total: number;
  papeis: Array<{ role: string; chars: number }>;
  sha256: string;
}

/**
 * O contexto em forma verificável: quantas mensagens, de que papéis, com que
 * tamanho, e o hash do conjunto. **Nenhum caractere de conteúdo sai daqui.**
 */
export function metaDasMensagens(
  messages: readonly ModelMessage[] | undefined,
): MetaDasMensagens | null {
  if (!messages || messages.length === 0) return null;
  return {
    total: messages.length,
    papeis: messages.map((m) => {
      const msg = m as unknown as { role?: unknown; content?: unknown };
      const conteudo =
        typeof msg.content === "string" ? msg.content : (JSON.stringify(msg.content) ?? "");
      return { role: String(msg.role ?? "desconhecido"), chars: conteudo.length };
    }),
    sha256: hash(messages),
  };
}

export function metaDasMensagensJson(
  messages: readonly ModelMessage[] | undefined,
): string | null {
  const meta = metaDasMensagens(messages);
  return meta === null ? null : JSON.stringify(meta);
}

interface PassoComFerramentas {
  toolCalls?: ReadonlyArray<{ toolName?: string; input?: unknown }>;
  toolResults?: ReadonlyArray<{ toolName?: string; output?: unknown }>;
  sources?: ReadonlyArray<unknown>;
}

export interface FerramentaDaTrilha {
  tool: string;
  input_hash: string;
  output_hash: string | null;
  output_chars: number | null;
}

/**
 * As fontes consultadas em forma de hash: qual ferramenta, hash do argumento e
 * do retorno, e o tamanho do retorno. O trecho em si não é duplicado.
 */
export function ferramentasDoTurno(steps: readonly PassoComFerramentas[]): FerramentaDaTrilha[] {
  const chamadas: FerramentaDaTrilha[] = [];
  for (const step of steps) {
    for (const chamada of step.toolCalls ?? []) {
      chamadas.push({
        tool: chamada.toolName ?? "?",
        input_hash: hash(chamada.input ?? null),
        output_hash: null,
        output_chars: null,
      });
    }
  }
  const resultados = steps.flatMap((s) => s.toolResults ?? []);
  resultados.forEach((resultado, i) => {
    const serializado = (() => {
      try {
        return typeof resultado.output === "string"
          ? resultado.output
          : (JSON.stringify(resultado.output) ?? "");
      } catch {
        return "";
      }
    })();
    const alvo = chamadas[i];
    if (alvo) {
      alvo.output_hash = hash(resultado.output ?? null);
      alvo.output_chars = serializado.length;
    } else {
      chamadas.push({
        tool: resultado.toolName ?? "?",
        input_hash: hash(null),
        output_hash: hash(resultado.output ?? null),
        output_chars: serializado.length,
      });
    }
  });
  return chamadas;
}

export interface FontesDaTrilha {
  total: number;
  hosts: string[];
}

/**
 * Citações do provedor sem título nem URL completa: só o host. É o suficiente
 * para "de onde veio" sem transformar a telemetria em cópia da web.
 */
export function fontesDoTurno(steps: readonly PassoComFerramentas[]): FontesDaTrilha | null {
  const fontes = steps.flatMap((s) => s.sources ?? []);
  if (fontes.length === 0) return null;
  const hosts = new Set<string>();
  for (const fonte of fontes) {
    const url = (fonte as { url?: unknown }).url;
    if (typeof url !== "string") continue;
    try {
      hosts.add(new URL(url).host);
    } catch {
      // URL inválida não vira host inventado.
    }
  }
  return { total: fontes.length, hosts: [...hosts].sort() };
}

export interface TrilhaDoTurno {
  prompt_system_hash: string | null;
  prompt_messages_meta: string | null;
  output_text_hash: string | null;
  output_chars: number | null;
  tool_calls: string | null;
  sources_meta: string | null;
}

export function trilhaDoTurno(args: {
  system: unknown;
  messages: readonly ModelMessage[] | undefined;
  saida: string | undefined;
  steps: readonly PassoComFerramentas[];
}): TrilhaDoTurno {
  const saida = (args.saida ?? "").trim();
  const ferramentas = ferramentasDoTurno(args.steps);
  const fontes = fontesDoTurno(args.steps);
  return {
    prompt_system_hash: hashDoSystem(args.system),
    prompt_messages_meta: metaDasMensagensJson(args.messages),
    // Saída vazia NÃO vira hash de "": seria afirmar que o modelo respondeu nada.
    output_text_hash: saida === "" ? null : hash(saida),
    output_chars: saida === "" ? null : saida.length,
    tool_calls: ferramentas.length > 0 ? JSON.stringify(ferramentas) : null,
    sources_meta: fontes === null ? null : JSON.stringify(fontes),
  };
}
