/**
 * O PASSE DE IA DO NCM — Gemini escolhe entre candidatos, nunca inventa.
 *
 * ─── Por que a IA não recebe a tabela inteira ────────────────────────────────
 *
 * Ela recebe o produto + os candidatos que a REGRA já separou (até 5). Três
 * motivos: (1) custo — 20 mil descrições por produto é dinheiro jogado fora;
 * (2) a regra já fez o trabalho grosso, a IA decide a dúvida fina; (3) a
 * resposta é CONFERÍVEL: o código devolvido tem que estar na lista enviada —
 * fora dela, é invenção e vai para o lixo.
 *
 * ─── Quando a IA aplica sozinha ─────────────────────────────────────────────
 *
 * Quase nunca: só quando ela escolhe o MESMO primeiro colocado da regra, com
 * confiança própria ≥ 0.85. Dois sistemas independentes concordando. Todo o
 * resto (discordância, confiança baixa, sem candidatos) vai para revisão
 * humana — com a opinião da IA anexada, para acelerar o humano em vez de
 * substituí-lo.
 *
 * ─── O que NCM errado custa ─────────────────────────────────────────────────
 *
 * Código errado em nota é autuação. Por isso: sem chave configurada, o passe
 * nem existe (o lote usa só regra); com chave, cada chamada pode falhar e a
 * falha vira "vai para revisão", nunca "aplica qualquer coisa".
 */

export interface CandidatoParaIa {
  ncm: string;
  descricao: string | null;
}

export interface OpiniaoDaIa {
  /** O código escolhido, ou null (nenhum serve). */
  ncm: string | null;
  /** 0–1 declarada pelo modelo. */
  confianca: number;
  /** Por que, em 1 frase. */
  motivo: string;
}

export interface ConfigGemini {
  chave: string;
  modelo: string;
}

export interface DepsIa {
  buscar: (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string },
  ) => Promise<{
    status: number;
    corpo: () => Promise<string>;
  }>;
}

export function promptDoNcm(nomeDoProduto: string, candidatos: CandidatoParaIa[]): string {
  const lista = candidatos
    .map((c, i) => `${i + 1}. NCM ${c.ncm}: ${c.descricao ?? "(sem descrição)"}`)
    .join("\n");
  return [
    "Você classifica produtos brasileiros no NCM para nota fiscal.",
    "Produto:",
    nomeDoProduto,
    "",
    "Candidatos (responda SOMENTE com um NCM desta lista, ou null):",
    lista,
    "",
    'Responda SOMENTE JSON: {"ncm": "<código ou null>", "confianca": <0-1>, "motivo": "<1 frase>"}.',
    "Se nenhum candidato descreve o produto, responda ncm null — nunca invente código.",
  ].join("\n");
}

/** Piso para a IA desempatar sozinha junto da regra. */
export const CONFIANCA_IA_AUTO = 0.85;

export async function sugerirNcmPorIa(
  nomeDoProduto: string,
  candidatos: CandidatoParaIa[],
  config: ConfigGemini,
  deps: DepsIa,
  tempoLimiteMs = 30_000,
): Promise<OpiniaoDaIa | null> {
  if (candidatos.length === 0) return null;

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.modelo)}` +
    `:generateContent?key=${encodeURIComponent(config.chave)}`;
  const corpo = JSON.stringify({
    contents: [{ parts: [{ text: promptDoNcm(nomeDoProduto, candidatos) }] }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 300,
      responseMimeType: "application/json",
    },
  });

  let texto: string;
  try {
    const controle = new AbortController();
    const limite = setTimeout(() => controle.abort(), tempoLimiteMs);
    try {
      const res = await deps.buscar(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: corpo,
      });
      if (res.status < 200 || res.status >= 300) return null;
      texto = await res.corpo();
    } finally {
      clearTimeout(limite);
    }
  } catch {
    return null;
  }

  let conteudo: string | null = null;
  try {
    const envelope = JSON.parse(texto) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const part = envelope.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof part === "string") conteudo = part;
  } catch {
    return null;
  }
  if (!conteudo) return null;

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(conteudo.trim()) as unknown;
  } catch {
    const bloco = conteudo.match(/\{[\s\S]*\}/)?.[0];
    if (!bloco) return null;
    try {
      parsed = JSON.parse(bloco) as unknown;
    } catch {
      return null;
    }
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const p = parsed as Record<string, unknown>;

  // A TRAVA: o código tem que estar na lista enviada. Fora dela é invenção —
  // e invenção em NCM é autuação com data marcada.
  const validos = new Set(candidatos.map((c) => c.ncm));
  const ncm = typeof p.ncm === "string" ? p.ncm.replace(/\D/g, "") : null;
  if (ncm !== null && !validos.has(ncm)) return null;

  const confianca =
    typeof p.confianca === "number" && Number.isFinite(p.confianca)
      ? Math.max(0, Math.min(1, p.confianca))
      : 0;

  return {
    ncm,
    confianca,
    motivo: typeof p.motivo === "string" ? p.motivo.trim().slice(0, 300) : "",
  };
}

/**
 * IA + regra concordam? O primeiro da regra E o da IA são o mesmo, com a
 * confiança da IA no piso. Dois sistemas independentes dizendo a mesma coisa.
 */
export function concordam(primeiroDaRegra: string, opiniao: OpiniaoDaIa | null): boolean {
  return (
    opiniao !== null && opiniao.ncm === primeiroDaRegra && opiniao.confianca >= CONFIANCA_IA_AUTO
  );
}
