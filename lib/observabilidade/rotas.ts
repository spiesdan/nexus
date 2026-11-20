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
