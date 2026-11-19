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

async function persistir(amostra: Amostra): Promise<void> {
  const { error } = await createAdminClient().from("api_request_samples").insert(amostra);
  if (error) {
    // Métrica não pode derrubar a requisição que já respondeu; fica o aviso.
    logger.warn("observabilidade.metrica_falhou", {
      rota: amostra.route,
      erro: error.message,
    });
  }
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

    try {
      after(() => persistir(amostra));
    } catch {
      // Fora do request context (teste/CLI): não inventa escrita.
    }

    return res;
  };
}
