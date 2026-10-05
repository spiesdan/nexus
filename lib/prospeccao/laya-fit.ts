import type { SupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * A QUALIFICAÇÃO DO PROSPECT — o "este aqui é dinheiro ou perda de tempo"?
 *
 * Onde estávamos: a aba Prospecção despeja centenas de empresas numa lista e
 * quem decide se vale abrir conversa é o humano — 10 segundos × centenas, por
 * busca. Esta camada joga essa primeira triagem no `laya-serve` local (mesma
 * VPS, mesma rede interna do radar): entra nome/categoria/cidade/região e
 * volta um enum de três letras. O que atravessa o cabo é PII_COMERCIAL de
 * empresa (nome, categoria, cidade), nunca conversa de cliente — o radar
 * (lib/leads/laya-decisao.ts) já define o padrão de contrato e de fail-soft.
 *
 * FAIL-SOFT É A REGRA: motor fora vira contagem + log, e a próxima passada
 * tenta de novo. O que fica gravado perde para "ainda não decidido" em vez
 * de travar a qualificação da fila inteira.
 */

export const LAYA_FIT = ["potencial", "duvidoso", "sem_potencial"] as const;
export type LayaFit = "potencial" | "duvidoso" | "sem_potencial";

/** Lote máximo por chamada — o teto do servidor é 64; folga para a pergunta. */
const MAX_LOTE = 64;

const PERGUNTA = {
  type: "choice",
  instructions:
    "Você lê os dados de um negócio que acabou de cair numa lista de prospecção " +
    "e responde à ÚNICA pergunta: este negócio tem perfil de cliente em potencial?",
  criteria: {
    potencial:
      "Nome, categoria ou região sugerem negócio real, ativo e alcançável (telefone ou website presentes pesam).",
    duvidoso:
      "Informação incompleta ou ambígua: não dá para confiar nem descartar sem abrir o dado.",
    sem_potencial:
      "Negócio fechado, nome de fachada, setor que este CRM não atende, ou dado claramente errado.",
  },
} as const;

export interface CandidatoFit {
  prospectId: string;
  nome: string;
  categoria: string | null;
  cidade: string | null;
  estado: string | null;
  temTelefone: boolean;
  temWebsite: boolean;
}

export interface ResultadoFit {
  qualificados: number;
  adiados: number;
  desligada: boolean;
  falhou: boolean;
}

export function motorFitLigado(): boolean {
  return env.LAYA_URL.trim().length > 0;
}

interface LinhaProspect {
  id: string;
  nome: string;
  categoria: string | null;
  cidade: string | null;
  estado: string | null;
  telefone: string | null;
  website: string | null;
}

/**
 * Qualifica em lote e grava `laya_fit` + `laya_fit_em`. Nunca lança — erro
 * vira `falhou: true`, igual ao radar.
 */
export async function qualificaProspects(
  admin: SupabaseClient,
  organizationId: string,
  now: Date,
): Promise<ResultadoFit> {
  const base: ResultadoFit = {
    qualificados: 0,
    adiados: 0,
    desligada: !motorFitLigado(),
    falhou: false,
  };
  if (base.desligada) return base;

  try {
    const teto = env.LAYA_FIT_POR_TICK;
    const { data, error } = await admin
      .from("business_prospects")
      .select("id, nome, categoria, cidade, estado, telefone, website")
      .eq("organization_id", organizationId)
      .eq("status_comercial", "novo")
      .eq("bloqueado", false)
      .is("laya_fit", null)
      .order("created_at", { ascending: false })
      .limit(teto);
    if (error) throw new Error(`candidatos: ${error.message}`);

    const candidatos = ((data ?? []) as LinhaProspect[]).map((p) => ({
      prospectId: p.id,
      nome: p.nome,
      categoria: p.categoria,
      cidade: p.cidade,
      estado: p.estado,
      temTelefone: Boolean(p.telefone),
      temWebsite: Boolean(p.website),
    }));
    if (candidatos.length === 0) return base;

    const estados = candidatos.map((c) =>
      [
        `Negócio: ${c.nome}`,
        `Categoria: ${c.categoria ?? "(não informada)"}`,
        `Região: ${[c.cidade, c.estado].filter(Boolean).join("/") || "(não informada)"}`,
        `Tem telefone: ${c.temTelefone ? "sim" : "não"} · Tem website: ${c.temWebsite ? "sim" : "não"}`,
      ].join("\n"),
    );

    for (let inicio = 0; inicio < candidatos.length; inicio += MAX_LOTE) {
      const fatiaC = candidatos.slice(inicio, inicio + MAX_LOTE);
      const fatiaE = estados.slice(inicio, inicio + MAX_LOTE);
      const respostas = await chamaOMotor(fatiaE);
      if (respostas === null) {
        return { ...base, falhou: true };
      }
      // Índice = índice, como no radar: os cortes rodam JUNTOS.
      const linhas = fatiaC.flatMap((c, i) => {
        const d = respostas[i];
        if (!d) return [];
        return [{ id: c.prospectId, laya_fit: d, laya_fit_em: now.toISOString() }];
      });
      for (const l of linhas) {
        const { error: errUpd } = await admin
          .from("business_prospects")
          .update({ laya_fit: l.laya_fit, laya_fit_em: l.laya_fit_em })
          .eq("id", l.id)
          .eq("organization_id", organizationId);
        if (errUpd) throw new Error(`gravação: ${errUpd.message}`);
        base.qualificados += 1;
      }
    }
    return base;
  } catch (e) {
    logger.warn("[prospeccao] qualificação do laya não concluída", {
      organizationId,
      erro: e instanceof Error ? e.message : String(e),
    });
    return { ...base, falhou: true };
  }
}

async function chamaOMotor(estados: string[]): Promise<Array<LayaFit | null> | null> {
  const url = `${env.LAYA_URL.replace(/\/+$/, "")}/v1/systemone/batch`;
  try {
    const resposta = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(env.LAYA_API_KEY ? { authorization: `Bearer ${env.LAYA_API_KEY}` } : {}),
      },
      body: JSON.stringify({ states: estados, questions: { fit: PERGUNTA } }),
      signal: AbortSignal.timeout(env.LAYA_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    const corpo = (await resposta.json()) as {
      results?: Array<{ answers?: Record<string, unknown> }>;
    };
    const results = corpo.results;
    if (!Array.isArray(results) || results.length !== estados.length) {
      throw new Error(
        `resposta com ${results?.length ?? 0} resultados para ${estados.length} states`,
      );
    }
    return results.map((r) => {
      const resposta = r.answers?.["fit"] as
        { type?: string; choice?: unknown; confidence?: unknown } | undefined;
      if (!resposta || resposta.type !== "choice") return null;
      const escolha = typeof resposta.choice === "string" ? resposta.choice : null;
      return LAYA_FIT.includes(escolha as LayaFit) ? (escolha as LayaFit) : null;
    });
  } catch (e) {
    logger.warn("[prospeccao] motor de qualificação indisponível", {
      url,
      estados: estados.length,
      erro: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
