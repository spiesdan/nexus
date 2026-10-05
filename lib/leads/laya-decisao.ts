import type { SupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * A SUGESTÃO DE AÇÃO — o motor de decisão que responde o chip do radar.
 *
 * O radar (0078) já responde "quem esfriou e há quanto tempo". Esta camada
 * responde a pergunta seguinte, que é a que move alguém: **fazer algo agora,
 * esperar, ou encerrar**. Uma pergunta por lead, nunca um rascunho de mensagem
 * — ação errada atrasa o trabalho humano; mensagem errada queima a conversa.
 *
 * QUEM DECIDE é o `laya-serve`, checkpoint local rodando na MESMA VPS, chamado
 * pela rede interna. O texto da conversa sai do banco e volta como um enum de
 * três letras — é a única coisa que atravessa esse cabo, e por isso ele não
 * sai da máquina: nada aqui vai para provedor de terceiro.
 *
 * CONTRATO DO SERVIDOR (medido no `laya/serve.py` do spike, 2026-10-04):
 *
 *   POST {LAYA_URL}/v1/systemone/batch
 *   Authorization: Bearer <LAYA_API_KEY>        (401 se errar)
 *   { "states": [string, ...], "questions": { qid: {type, instructions, criteria} } }
 *   → { "results": [ { model, answers: { qid: {type, choice, confidence, ...} } } ],
 *       "total_usage": {...} }                  — na MESMA ordem dos states
 *
 * Limites do servidor: 64 states, 64 questions, 100 opções de choice,
 * state de 50 000 caracteres, corpo de 2 MB. Aqui se manda 1 pergunta e
 * `MAX_LOTE = 64` states por chamada (o servidor CHUNKA sozinho acima disso,
 * mas não precisa: o teto de orçamento já é menor).
 *
 * FAIL-SOFT É A REGRA DESTE ARQUIVO, e não um detalhe: o observador de
 * travessia roda no mesmo tick do cron que grava estado do radar, e uma
 * indisponibilidade do motor não pode virar "ninguém esfriou mais". Erro aqui
 * vira log + contagem, e o próximo tick tenta de novo. Decisão atrasada é
 * melhor que cron travado.
 */

/** O vocabulário da decisão — espelhado no CHECK do banco (0258) e coberto por `tests/invariants/vocabulario-banco-x-typescript.test.ts`. */
export type AcaoDaDecisao = "reativar" | "aguardar" | "encerrar";

export const ACOES_DA_DECISAO: readonly AcaoDaDecisao[] = [
  "reativar",
  "aguardar",
  "encerrar",
];

/** Teto de states por chamada — o `MAX_BATCH_STATES` do servidor. */
const MAX_LOTE = 64;
/** Mensagens por contato levadas ao modelo (mais recentes primeiro). */
const MENSHIST = 8;
/** Corpo de cada mensagem, truncado antes de entrar no estado. */
const CORPO_MAX = 400;
/** Teto de caracteres do estado montado — o servidor recusa acima de 50 000. */
const ESTADO_MAX = 4_000;

/** A pergunta única. `criteria` é a descrição de cada opção, não rótulo vazio. */
const PERGUNTA = {
  type: "choice",
  instructions:
    "Você lê um negócio parado num funil de vendas (cliente sem resposta além da janela do estágio) " +
    "e o histórico recente da conversa. Responda à ÚNICA pergunta: qual ação sugerir AGORA para este negócio?",
  criteria: {
    reativar:
      "Vale mandar mensagem agora: o cliente demonstrou interesse recente, pediu algo que ficou pendente " +
      "ou a última palavra foi nossa e ele espera resposta.",
    aguardar:
      "Não é hora de insistir: o cliente já foi respondido, a negociação é longa por natureza, " +
      "ou um contato agora queimaria a conversa.",
    encerrar:
      "Não há vida nesta negociação: sem resposta a repetidas tentativas, pedido sem sentido, " +
      "ou o cliente deixou claro que não quer seguir.",
  },
} as const;

export interface CandidatoDeDecisao {
  leadId: string;
  contactId: string;
  /** Bucket ATUAL no radar — contexto enviado ao modelo. */
  bucket: "em_risco" | "critico";
  /** Quando esfriou (o `since` já gravado), para dizer há quanto tempo. */
  esfriouEm: Date;
}

/**
 * Orçamento compartilhado entre TODAS as organizações de uma passada do cron.
 *
 * Objeto mutável de propósito: a rota cria um por invocação e cada org consome
 * do mesmo. Sem isso, 50 orgs x 32 decisões seriam 1 600 inferências num tick
 * de 60 s — o teto existe justamente para que a última org da lista não fique
 * sem sugestão enquanto a primeira leva tudo.
 */
export interface OrcamentoDaDecisao {
  restante: number;
}

export interface ResultadoDaDecisao {
  /** Decisões efetivamente gravadas. */
  decididas: number;
  /** Candidatos fora do orçamento desta passada — o próximo tick pega. */
  adiadas: number;
  /** Candidatos sem evidência (sem mensagem) — não se decide no escuro. */
  semEvidencia: number;
  /** true = recurso desligado (sem LAYA_URL); false = ligado. */
  desligada: boolean;
  /** true = o motor foi chamado e não respondeu o que devia (fail-soft). */
  falhou: boolean;
}

/** O motor está configurado para rodar? Sem URL, o recurso fica desligado. */
export function motorDeDecisaoLigado(): boolean {
  return env.LAYA_URL.trim().length > 0;
}

/** Orçamento novo para UMA passada do cron — ver `OrcamentoDaDecisao`. */
export function novoOrcamento(): OrcamentoDaDecisao {
  return { restante: env.LAYA_DECISAO_POR_TICK };
}

interface LinhaDeMensagem {
  contact_id: string;
  body: string | null;
  direction: string;
  sent_at: string;
}

interface DecisaoGravada {
  lead_id: string;
}

/**
 * Decide os candidatos e grava as decisões.
 *
 * Nunca lança: qualquer falha (motor fora, corpo malformado, banco) vira
 * `falhou: true` com log, para o chamador contar e seguir com o resto do tick.
 */
export async function decideAcoesDoRadar(
  admin: SupabaseClient,
  organizationId: string,
  candidatos: CandidatoDeDecisao[],
  now: Date,
  orcamento: OrcamentoDaDecisao,
): Promise<ResultadoDaDecisao> {
  const base: ResultadoDaDecisao = {
    decididas: 0,
    adiadas: 0,
    semEvidencia: 0,
    desligada: !motorDeDecisaoLigado(),
    falhou: false,
  };
  if (base.desligada || candidatos.length === 0) return base;

  // ORÇAMENTO PRIMEIRO: o que não cabe nesta passada nem é coletado — sem
  // query de mensagens para lead que não será decidido.
  const cabe = Math.max(0, Math.min(candidatos.length, orcamento.restante));
  const lote = candidatos.slice(0, cabe);
  base.adiadas = candidatos.length - cabe;
  if (lote.length === 0) return base;

  try {
    const contatos = [...new Set(lote.map((c) => c.contactId))];

    const [titulos, msgs] = await Promise.all([
      admin
        .from("crm_leads")
        .select("id, title")
        .eq("organization_id", organizationId)
        .in(
          "id",
          lote.map((c) => c.leadId),
        ),
      admin
        .from("messages")
        .select("contact_id, body, direction, sent_at")
        .eq("organization_id", organizationId)
        .in("contact_id", contatos)
        .order("sent_at", { ascending: false })
        .limit(contatos.length * MENSHIST),
    ]);
    if (titulos.error) throw new Error(`títulos: ${titulos.error.message}`);
    if (msgs.error) throw new Error(`mensagens: ${msgs.error.message}`);

    const tituloPorLead = new Map<string, string>(
      ((titulos.data ?? []) as Array<{ id: string; title: string }>).map((t) => [t.id, t.title]),
    );

    // Janela por contato, em ORDEM CRONOLÓGICA (a query vem da mais nova).
    const historico = new Map<string, Array<{ fala: string; texto: string }>>();
    for (const m of (msgs.data ?? []) as LinhaDeMensagem[]) {
      const lista = historico.get(m.contact_id) ?? [];
      if (lista.length < MENSHIST) {
        const corpo = (m.body ?? "(mídia sem texto)").replace(/\s+/g, " ").trim().slice(0, CORPO_MAX);
        lista.push({ fala: m.direction === "inbound" ? "cliente" : "atendente", texto: corpo });
      }
      historico.set(m.contact_id, lista);
    }

    const estados: string[] = [];
    const pendentes: CandidatoDeDecisao[] = [];
    for (const c of lote) {
      const linhas = historico.get(c.contactId);
      // SEM EVIDÊNCIA NÃO SE DECIDE. Um lead sem histórico nenhum chegaria como
      // "sem mensagens" e o modelo responderia sobre um vazio com a mesma
      // confiança de um caso real — e a tela não distingue uma da outra.
      if (!linhas || linhas.length === 0) {
        base.semEvidencia += 1;
        continue;
      }
      const horas = Math.max(0, Math.round((now.getTime() - c.esfriouEm.getTime()) / 3_600_000));
      const estado = [
        `Negócio: ${tituloPorLead.get(c.leadId) ?? "(sem título)"}`,
        `Situação no radar: ${c.bucket} — esfriou há ${horas}h, sem resposta além da janela do funil.`,
        `Conversa recente (do mais antigo para o mais novo):`,
        ...linhas.map((l) => `[${l.fala}] ${l.texto}`),
      ].join("\n");
      estados.push(estado.slice(0, ESTADO_MAX));
      pendentes.push(c);
    }
    if (pendentes.length === 0) return base;

    // LOTES DE 64 — o teto do servidor. O orçamento já é menor que isso na
    // prática, mas o corte é barato e evita depender de qual número muda primeiro.
    for (let inicio = 0; inicio < estados.length; inicio += MAX_LOTE) {
      const fatiaEstados = estados.slice(inicio, inicio + MAX_LOTE);
      const fatiaLeads = pendentes.slice(inicio, inicio + MAX_LOTE);
      const respostas = await chamaOMotor(fatiaEstados);
      if (respostas === null) {
        base.falhou = true;
        break;
      }
      // Índice = índice: `respostas[i]` é a resposta de `fatiaLeads[i]`. O
      // filtro e o map rodam JUNTOS justamente para isso não se perder — um
      // `filter` antes de um `map` por posição desalinaria lead e decisão, que
      // é o defeito que a tela não tem como detectar.
      const linhas = fatiaLeads.flatMap((c, i) => {
        const d = respostas[i];
        if (!d) return [];
        return [
          {
            lead_id: c.leadId,
            organization_id: organizationId,
            acao: d.acao,
            confianca: d.confianca,
            modelo: d.modelo,
            decidido_em: now.toISOString(),
          },
        ];
      });
      if (linhas.length === 0) continue;

      const { error } = await admin
        .from("crm_lead_risk_decisions")
        .upsert(linhas, { onConflict: "lead_id" });
      if (error) throw new Error(`gravação: ${error.message}`);
      base.decididas += linhas.length;
      orcamento.restante = Math.max(0, orcamento.restante - linhas.length);
    }
    return base;
  } catch (e) {
    logger.warn("[radar] sugestão de ação não concluída", {
      organizationId,
      candidatos: candidatos.length,
      erro: e instanceof Error ? e.message : String(e),
    });
    return { ...base, falhou: true };
  }
}

/**
 * Uma chamada ao motor. Devolve `null` quando NÃO respondeu — o sinal de
 * fail-soft — e um array com UMA entrada por state quando respondeu (uma
 * entrada nula por state cuja resposta não era um `choice` nosso, que é
 * recusa legítima do modelo e não erro do sistema).
 */
async function chamaOMotor(
  estados: string[],
): Promise<Array<{ acao: AcaoDaDecisao; confianca: number | null; modelo: string | null } | null> | null> {
  const url = `${env.LAYA_URL.replace(/\/+$/, "")}/v1/systemone/batch`;
  try {
    const resposta = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(env.LAYA_API_KEY ? { authorization: `Bearer ${env.LAYA_API_KEY}` } : {}),
      },
      body: JSON.stringify({ states: estados, questions: { acao: PERGUNTA } }),
      signal: AbortSignal.timeout(env.LAYA_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    const corpo = (await resposta.json()) as {
      results?: Array<{ model?: string; answers?: Record<string, unknown> }>;
    };
    const results = corpo.results;
    if (!Array.isArray(results) || results.length !== estados.length) {
      throw new Error(`resposta com ${results?.length ?? 0} resultados para ${estados.length} states`);
    }
    return results.map((r) => interpretaResposta(r));
  } catch (e) {
    logger.warn("[radar] motor de decisão indisponível", {
      url,
      estados: estados.length,
      erro: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

function interpretaResposta(
  resultado: { model?: string; answers?: Record<string, unknown> },
): { acao: AcaoDaDecisao; confianca: number | null; modelo: string | null } | null {
  const resposta = resultado.answers?.["acao"] as
    | { type?: string; choice?: unknown; confidence?: unknown }
    | undefined;
  if (!resposta || resposta.type !== "choice") return null;
  const escolha = typeof resposta.choice === "string" ? resposta.choice : null;
  if (!escolha || !ACOES_DA_DECISAO.includes(escolha as AcaoDaDecisao)) return null;
  const confianca =
    typeof resposta.confidence === "number" && resposta.confidence >= 0 && resposta.confidence <= 1
      ? resposta.confidence
      : null;
  return {
    acao: escolha as AcaoDaDecisao,
    confianca,
    modelo: typeof resultado.model === "string" ? resultado.model : null,
  };
}

/**
 * Quem AINDA não tem decisão e está frio — o preenchimento de acervo.
 *
 * Sem isto, o primeiro tick de uma instalação decidiria só os leads que
 * acabaram de esfriar, e o acervo já frio (o caso medido na estreia: dezenas
 * de negócios parados) apareceria no radar sem sugestão nenhuma — invisível
 * justamente para quem chegou agora.
 */
export async function candidatosSemDecisao(
  admin: SupabaseClient,
  organizationId: string,
  frios: Array<{ leadId: string; contactId: string; bucket: "em_risco" | "critico"; esfriouEm: Date }>,
): Promise<string[]> {
  if (frios.length === 0) return [];
  const { data, error } = await admin
    .from("crm_lead_risk_decisions")
    .select("lead_id")
    .eq("organization_id", organizationId)
    .in(
      "lead_id",
      frios.map((f) => f.leadId),
    );
  if (error) throw new Error(`decisões gravadas: ${error.message}`);
  const tem = new Set(((data ?? []) as DecisaoGravada[]).map((d) => d.lead_id));
  return frios.filter((f) => !tem.has(f.leadId)).map((f) => f.leadId);
}
