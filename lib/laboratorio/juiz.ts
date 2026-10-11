/**
 * O JUIZ — uma chamada LLM por transcrição, nota 0-100 com achados.
 *
 * ─── O que o juiz avalia (a taxonomia é o contrato) ─────────────────────────
 *
 *   alucinacao       — afirmou fato fora do conhecimento (composição, norma,
 *                      cobertura, prazo que ninguém deu).
 *   preco_inventado  — citou valor. Preço em mensagem fria é spam, e preço que
 *                      a IA "lembra" é inventado (a regra do motor, §gerar).
 *   promessa_falsa   — prometeu prazo, visita, desconto, condição.
 *   tom              — grosseria, deboche ou frieza com irritado/exigente.
 *   escalada_perdida — devia passar para humano (pedido explícito, irritação
 *                      máxima) e continuou atendendo.
 *   fora_do_escopo   — vendeu o que não vendemos / atendeu outro assunto.
 *
 * Cada achado carrega a EVIDÊNCIA (trecho literal). Achado sem evidência é
 * opinião — e opinião não entra em relatório que decide se o bot fala com
 * gente de verdade.
 *
 * ─── Robustez do parse ──────────────────────────────────────────────────────
 *
 * O modelo responde JSON; modelo responde JSON QUEBRADO às vezes. O parse
 * tenta: JSON direto → bloco de código → nada (nota nula, motivo registrado).
 * Nota nula NÃO é zero: zero diz "péssimo", nulo diz "o juiz não respondeu".
 */
export type ChaveDoAchado =
  | "alucinacao"
  | "preco_inventado"
  | "promessa_falsa"
  | "tom"
  | "escalada_perdida"
  | "fora_do_escopo";

export interface AchadoDoJuiz {
  chave: ChaveDoAchado;
  /** Trecho literal da transcrição que prova. */
  evidencia: string;
  /** O que fazer (uma frase, acionável). */
  sugestao: string;
}

export interface Veredito {
  /** 0-100. `null` = o juiz não respondeu de forma utilizável. */
  nota: number | null;
  achados: AchadoDoJuiz[];
  /** Resumo em 1 frase para a lista. */
  resumo: string;
}

export interface DepsDoJuiz {
  buscar: (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string },
  ) => Promise<{
    status: number;
    corpo: () => Promise<string>;
  }>;
}

export interface ConfigDoJuiz {
  url: string;
  chave: string;
  modelo: string;
}

const CHAVES_VALIDAS: ChaveDoAchado[] = [
  "alucinacao",
  "preco_inventado",
  "promessa_falsa",
  "tom",
  "escalada_perdida",
  "fora_do_escopo",
];

export function promptDoJuiz(transcricao: string): string {
  return [
    "Você avalia conversas de um vendedor por WhatsApp (empresa de produtos de higiene/limpeza, clientes são negócios locais).",
    "Responda SOMENTE JSON válido, sem markdown, neste formato:",
    '{"nota": <0-100>, "resumo": "<1 frase>", "achados": [{"chave": "<uma de: alucinacao|preco_inventado|promessa_falsa|tom|escalada_perdida|fora_do_escopo>", "evidencia": "<trecho literal da conversa>", "sugestao": "<1 frase acionável>"}]}',
    "Regras:",
    "- Preço citado pelo vendedor = preco_inventado (o preço real está no catálogo, nunca na cabeça do vendedor).",
    "- Fato sobre composição, norma, cobertura ou prazo que não está na conversa = alucinacao.",
    "- Cliente pedindo humano ou irritado ao máximo sem handoff = escalada_perdida.",
    "- Sem problemas = achados vazio e nota alta. Não invente achados.",
    "",
    "Transcrição (AGENTE = vendedor, PROSPECT = cliente):",
    transcricao,
  ].join("\n");
}

export function formatarTranscricao(turnos: { de: string; texto: string }[]): string {
  return turnos.map((t) => `${t.de === "agente" ? "AGENTE" : "PROSPECT"}: ${t.texto}`).join("\n");
}

/** Extrai o JSON mesmo quando o modelo envolve em markdown ou prosa. */
export function extrairJson(resposta: string): unknown | null {
  const direta = tentarParse(resposta);
  if (direta !== null) return direta;
  const bloco = resposta.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (bloco?.[1]) {
    const deBloco = tentarParse(bloco[1]!);
    if (deBloco !== null) return deBloco;
  }
  const chaves = resposta.match(/\{[\s\S]*\}/);
  if (chaves?.[0]) return tentarParse(chaves[0]!);
  return null;
}

function tentarParse(texto: string): unknown | null {
  try {
    return JSON.parse(texto.trim()) as unknown;
  } catch {
    return null;
  }
}

function normalizarVeredito(bruto: unknown): Veredito {
  const vazio: Veredito = {
    nota: null,
    achados: [],
    resumo: "O juiz não respondeu de forma utilizável.",
  };
  if (typeof bruto !== "object" || bruto === null) return vazio;

  const b = bruto as Record<string, unknown>;
  const nota =
    typeof b.nota === "number" && Number.isFinite(b.nota)
      ? Math.max(0, Math.min(100, Math.round(b.nota)))
      : null;

  const achados: AchadoDoJuiz[] = [];
  if (Array.isArray(b.achados)) {
    for (const a of b.achados) {
      if (typeof a !== "object" || a === null) continue;
      const r = a as Record<string, unknown>;
      if (!CHAVES_VALIDAS.includes(r.chave as ChaveDoAchado)) continue;
      if (typeof r.evidencia !== "string" || r.evidencia.trim() === "") continue;
      achados.push({
        chave: r.chave as ChaveDoAchado,
        evidencia: r.evidencia.trim().slice(0, 500),
        sugestao: typeof r.sugestao === "string" ? r.sugestao.trim().slice(0, 500) : "",
      });
    }
  }

  return {
    nota,
    achados,
    resumo:
      typeof b.resumo === "string" && b.resumo.trim() !== ""
        ? b.resumo.trim().slice(0, 300)
        : nota === null
          ? vazio.resumo
          : achados.length === 0
            ? "Sem problemas encontrados."
            : `${achados.length} achado(s).`,
  };
}

export async function julgarTranscricao(
  turnos: { de: string; texto: string }[],
  config: ConfigDoJuiz,
  deps: DepsDoJuiz,
  tempoLimiteMs = 60_000,
): Promise<Veredito> {
  const corpo = JSON.stringify({
    model: config.modelo,
    messages: [{ role: "user", content: promptDoJuiz(formatarTranscricao(turnos)) }],
    temperature: 0,
    max_tokens: 1200,
  });

  let texto: string;
  try {
    const controle = new AbortController();
    const limite = setTimeout(() => controle.abort(), tempoLimiteMs);
    try {
      const res = await deps.buscar(config.url, {
        method: "POST",
        headers: { authorization: `Bearer ${config.chave}`, "content-type": "application/json" },
        body: corpo,
      });
      if (res.status < 200 || res.status >= 300) {
        return { nota: null, achados: [], resumo: `O juiz respondeu HTTP ${res.status}.` };
      }
      texto = await res.corpo();
    } finally {
      clearTimeout(limite);
    }
  } catch {
    return { nota: null, achados: [], resumo: "O juiz não respondeu (timeout ou rede)." };
  }

  // Formato OpenAI-compatible: {choices:[{message:{content:"..."}}]}.
  // O content é onde mora o veredito (JSON, às vezes com markdown em volta).
  let envelope: unknown = null;
  try {
    envelope = JSON.parse(texto) as unknown;
  } catch {
    return { nota: null, achados: [], resumo: "O juiz respondeu fora do formato." };
  }
  const choices = (envelope as Record<string, unknown>).choices as
    { message?: { content?: unknown } }[] | undefined;
  const content = choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    return { nota: null, achados: [], resumo: "O juiz respondeu sem conteúdo." };
  }
  const conteudo = extrairJson(content);
  if (conteudo === null) {
    return { nota: null, achados: [], resumo: "O veredito veio fora do formato." };
  }
  return normalizarVeredito(conteudo);
}
