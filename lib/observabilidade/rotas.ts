/**
 * Instrumentação das cinco rotas quentes do SLO (doc 42).
 *
 * Uma amostra por requisição, escrita DEPOIS da resposta (`after`), para não
 * somar latência ao caminho de sucesso. Não guarda body, mensagem, PII nem
 * query string: rota, status, duração, código de 5xx, request id e a org do
 * cookie `active_org` quando existe.
 *
 * Amostragem: 100% hoje (`AMOSTRAGEM = 1`). Se a série pesar, baixe a constante
 * e declare a taxa no doc 42 — a tela continua dizendo "sem histórico" quando
 * não houver amostra suficiente.
 */
import { after } from "next/server";
import type { NextRequest } from "next/server";

import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROTAS_DO_SLO } from "./rotas-slo";

export { ROTAS_DO_SLO };


/** Fração das requisições medidas. 1 = 100%. */
export const AMOSTRAGEM = 1;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Amostra {
  organization_id: string | null;
  route: string;
  status: number;
  duration_ms: number;
  code: string | null;
  request_id: string | null;
}

type Handler = (req: NextRequest, contexto?: unknown) => Promise<Response>;

function organizacaoDoCookie(req: NextRequest): string | null {
  const valor = req.cookies?.get?.("active_org")?.value;
  return valor && UUID.test(valor) ? valor : null;
}

async function codigoDoErro(res: Response): Promise<string | null> {
  if (res.status < 500) return null;
  try {
    const corpo = (await res.clone().json()) as { error?: { code?: unknown } };
    return typeof corpo.error?.code === "string" ? corpo.error.code.slice(0, 80) : null;
  } catch {
    return null;
  }
}

let falhaDaMetricaLogada = false;

/** Só para teste: isola a trava de log entre casos. */
export function __resetFalhaDaMetrica(): void {
  falhaDaMetricaLogada = false;
}

async function persistir(amostra: Amostra): Promise<void> {
  const { error } = await createAdminClient().from("api_request_samples").insert(amostra);
  if (error) throw new Error(error.message);
  // Voltou a gravar: a próxima falha merece uma linha nova.
  falhaDaMetricaLogada = false;
}

function logarFalhaDaMetrica(amostra: Amostra, erro: unknown): void {
  // UMA linha por OUTAGE, não por requisição: se o instrumento está mudo, cada
  // request falharia e o log viraria o novo silêncio. A trava reabre no
  // primeiro insert bem-sucedido.
  if (falhaDaMetricaLogada) return;
  falhaDaMetricaLogada = true;
  logger.error("observabilidade.metrica_falhou", {
    rota: amostra.route,
    erro: erro instanceof Error ? erro.message : String(erro),
    definitivo: true,
  });
}

export interface SondaRegistrada {
  id: string;
  created_at: string;
  duracao_ms: number;
  origem: "cron" | "manual";
  ok: true;
}

/**
 * Prova o caminho de escrita sem depender de tráfego humano e SEM entrar na
 * série de SLO. Usa a mesma admin client/insert que `persistir`; a diferença é
 * a tabela, de propósito (uma linha `__sonda__` na série mudaria contagem,
 * idade e retenção do diagnóstico).
 */
export async function registrarSonda(origem: "cron" | "manual"): Promise<SondaRegistrada> {
  const admin = createAdminClient();
  const inicio = performance.now();
  const { data, error } = await admin
    .from("api_request_probes")
    .insert({ origem, duracao_ms: 0, ok: false })
    .select("id, created_at")
    .single();

  if (error || !data) {
    logger.error("observabilidade.sonda_falhou", {
      origem,
      erro: error?.message ?? "insert sem linha",
    });
    throw new Error(error?.message ?? "sonda sem linha");
  }

  const duracao = Math.round((performance.now() - inicio) * 10) / 10;
  const { error: erroUpdate } = await admin
    .from("api_request_probes")
    .update({ duracao_ms: duracao, ok: true })
    .eq("id", (data as { id: string }).id);

  if (erroUpdate) {
    // A linha fica `ok=false`: o insert passou, mas a sonda não fechou.
    logger.error("observabilidade.sonda_falhou", { origem, erro: erroUpdate.message });
    throw new Error(erroUpdate.message);
  }

  return {
    id: (data as { id: string }).id,
    created_at: (data as { created_at: string }).created_at,
    duracao_ms: duracao,
    origem,
    ok: true,
  };
}

/**
 * Envolve o GET de uma rota quente. Em teste (fora do contexto do Next),
 * `after()` lança e a amostra é descartada — o teste de rota não escreve no
 * banco, e o comportamento da resposta não muda.
 */
export function comMetricas(rota: string, handler: Handler): Handler {
  return async (req, contexto) => {
    const inicio = performance.now();
    const res = await handler(req, contexto);
    const duracao = Math.round((performance.now() - inicio) * 10) / 10;

    if (AMOSTRAGEM < 1 && Math.random() > AMOSTRAGEM) return res;

    const amostra: Amostra = {
      organization_id: organizacaoDoCookie(req),
      route: rota,
      status: res.status,
      duration_ms: duracao,
      code: await codigoDoErro(res),
      request_id: res.headers.get("x-request-id"),
    };

    let agendouNoAfter = false;
    try {
      after(async () => {
        try {
          await persistir(amostra);
        } catch (erro) {
          logarFalhaDaMetrica(amostra, erro);
        }
      });
      agendouNoAfter = true;
    } catch {
      // `after()` indisponível (standalone/teste/CLI): segundo caminho.
    }

    if (!agendouNoAfter) {
      void persistir(amostra).catch((erro) => logarFalhaDaMetrica(amostra, erro));
    }

    return res;
  };
}
