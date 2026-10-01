/**
 * A classificação da resposta (spec 18 §11) — ALTO / MEDIO / BAIXO / RECUSOU,
 * gravada em `automatic_sales_queue.interest_level` (estruturada no banco,
 * nunca em prosa).
 *
 * Duas partes: um classificador PURO (o JSON do modelo → contrato do repo,
 * com defesa contra cerca forjada e formato torto) e a chamada de modelo (o
 * propósito `automatic_sales_classification`, resolvido pelo painel de
 * provedores como qualquer ponto configurável).
 */
import { randomUUID } from "node:crypto";

import type pg from "pg";
import type { ModelMessage } from "ai";

import { runModelCall, type LlmEdgeConfig } from "@/lib/agent-engine/edge/llm/run-model-call";

import type { NivelDeInteresse } from "./tipos";
import { NIVEIS_DE_INTERESSE } from "./tipos";

export interface ResultadoDaClassificacao {
  interesse: NivelDeInteresse;
  /** A pessoa quer comprar/pedir AGORA (§13: vira oportunidade, não pedido). */
  oportunidade: boolean;
  /** Necessidade dita, quando disser — vai para o lead (§12). */
  necessidade: string | null;
}

/** Teto do que vai ao modelo — a conversa inteira não vira prompt gigante. */
const MAX_TRECHO = 4000;

export function systemDoClassificador(): string {
  return (
    "[MODO CLASSIFICACAO DE RESPOSTA - VENDA AUTOMATICA]\n" +
    "A pessoa respondeu a uma primeira mensagem de prospecao comercial. " +
    "Classifique a resposta. Responda SO com um JSON minimo, sem texto fora dele:\n" +
    '{"interesse":"alto|medio|baixo|recusou","oportunidade":true|false,"necessidade":"..."|null}\n\n' +
    "interesse:\n" +
    '- "alto" — quer preco/catalogo/propostas, demonstra vontade de comprar.\n' +
    '- "medio" — pergunta o que voces tem, mas ainda e cedo para dizer se compra.\n' +
    '- "baixo" — "agora nao preciso", "depois", frio mas educado.\n' +
    '- "recusou" — "nao temos interesse", "nao quero", bloqueia o contato.\n' +
    "oportunidade: true so quando ela pede para comprar, pedir orcamento ou fechar agora; false no resto.\n" +
    "necessidade: um trecho curto com o que ela disse precisar (ou null).\n" +
    "Nao invente nada que o texto nao diga. Nao classifique o QUE VOCES venderam — classifique o que ELA disse."
  );
}

/**
 * O JSON do modelo → contrato do repo.
 *
 * Defesa em três camadas, e as três já fizeram falta em saídas de modelo:
 * fence de código (````json) é removida; o primeiro objeto equilibrado é
 * isolado (o modelo comenta às vezes); e o valor de `interesse` é lido contra
 * a lista do repo — o que a pessoa digitou (minúsculo/acento) não passa reto
 * para o banco, que tem CHECK.
 */
export function interpretarClassificacao(bruto: string): ResultadoDaClassificacao | null {
  let limpo = bruto.trim();
  limpo = limpo.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const inicio = limpo.indexOf("{");
  if (inicio < 0) return null;
  let fim = -1;
  let profundidade = 0;
  for (let i = inicio; i < limpo.length; i++) {
    const c = limpo[i];
    if (c === "{") profundidade++;
    else if (c === "}") {
      profundidade--;
      if (profundidade === 0) {
        fim = i;
        break;
      }
    }
  }
  if (fim < 0) return null;

  let dados: unknown;
  try {
    dados = JSON.parse(limpo.slice(inicio, fim + 1));
  } catch {
    return null;
  }
  if (typeof dados !== "object" || dados === null) return null;
  const obj = dados as Record<string, unknown>;

  const interesseBruto = typeof obj.interesse === "string" ? obj.interesse.trim().toLowerCase() : "";
  const interesse = (NIVEIS_DE_INTERESSE as readonly string[]).includes(interesseBruto)
    ? (interesseBruto as NivelDeInteresse)
    : null;
  if (interesse === null) return null;

  const oportunidade = obj.oportunidade === true;
  const necessidade =
    typeof obj.necessidade === "string" && obj.necessidade.trim() !== ""
      ? obj.necessidade.trim().slice(0, 300)
      : null;

  return { interesse, oportunidade, necessidade };
}

export interface EntradaDaClassificacao {
  tenantId: string;
  contactId: string;
  /** O trecho da conversa: primeira mensagem + respostas, já montado. */
  trecho: string;
}

export type Resultado =
  | { ok: true; classificacao: ResultadoDaClassificacao }
  | { ok: false; reason: string };

export async function classificarResposta(
  db: pg.Pool,
  llmCfg: LlmEdgeConfig,
  entrada: EntradaDaClassificacao,
): Promise<Resultado> {
  const nonce = randomUUID().slice(0, 8);
  const messages: ModelMessage[] = [
    {
      role: "user",
      content: `<conversa id="${nonce}">\n${entrada.trecho.slice(-MAX_TRECHO)}\n</conversa id="${nonce}">`,
    },
  ];

  try {
    const { result } = await runModelCall(db, llmCfg, {
      tenantId: entrada.tenantId,
      leadId: entrada.contactId,
      jobId: null,
      purpose: 'automatic_sales_classification',
      system: systemDoClassificador(),
      messages,
    });
    const classificacao = interpretarClassificacao(result.text ?? "");
    if (!classificacao) return { ok: false, reason: "json_invalido" };
    return { ok: true, classificacao };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
