/**
 * GET/POST /api/v1/cron/sentinel — a varredura agendada.
 *
 * Roda a cada 15 minutos, mas cada organização só é varrida quando o intervalo
 * dela vence (`sentinel_settings.intervalo_minutos`, default 6h). Um limite de
 * 3 organizações por tick protege o timeout do scheduler; instalação com muitas
 * orgs drena ao longo dos ticks.
 *
 * Kill switch: `SENTINEL_ENABLED=false` no `.env` responde `desligado` sem
 * tocar o banco. Desligado por organização é decidido dentro do executor.
 *
 * Rodada vazia não audita (regra do CLAUDE.md): o próprio `sentinel_runs` é o
 * registro de "o cron rodou", e `executarSentinela` só emite audit quando há
 * achado, encerramento ou falha.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { organizacoesDevidas, type AgendaSentinel } from "@/lib/sentinel/agenda";
import { sentinelLigadoNoAmbiente } from "@/lib/sentinel/config";
import { executarSentinela, type ResultadoExecucao } from "@/lib/sentinel/execucao";

export const dynamic = "force-dynamic";

const TAMANHO_DA_RODADA = 3;

interface Resumo {
  organization_id: string;
  status: ResultadoExecucao["status"];
  achados: number;
  criadas: number;
  reafirmadas: number;
  encerradas: number;
  truncado: boolean;
  execucao_id: string | null;
  motivo: string | null;
}

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  const accepted = [env.INTERNAL_CRON_SECRET, env.INTERNAL_SECRET].filter(Boolean);
  if (accepted.length === 0 || !provided || !accepted.includes(provided)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }

  if (!sentinelLigadoNoAmbiente()) {
    return ok({ desligado: true, organizacoes: [] }, { requestId });
  }

  let agenda: AgendaSentinel;
  try {
    agenda = await organizacoesDevidas(Date.now(), TAMANHO_DA_RODADA);
  } catch (erro) {
    logger.error("sentinel.cron_due_failed", {
      erro: erro instanceof Error ? erro.message : String(erro),
    });
    return fail("internal_error", "Não foi possível calcular a agenda.", 500, { requestId });
  }

  // Suspensas vêm depois das ativas: elas não podem atrasar a detecção real,
  // mas ainda precisam da rodada registrada e do fechamento com motivo.
  const fila = [...agenda.devidas, ...agenda.suspensas];

  if (fila.length === 0) {
    return ok(
      { desligado: false, organizacoes: [], organizacoes_puladas: 0 },
      { requestId },
    );
  }

  const resumos: Resumo[] = [];
  for (const org of fila) {
    const resultado = await executarSentinela({
      organizationId: org.organizationId,
      origem: "cron",
    });
    resumos.push({
      organization_id: org.organizationId,
      status: resultado.status,
      achados: resultado.achados,
      criadas: resultado.criadas,
      reafirmadas: resultado.reafirmadas,
      encerradas: resultado.encerradas,
      truncado: resultado.truncado,
      execucao_id: resultado.execucaoId,
      motivo: resultado.motivo,
    });
  }

  return ok(
    {
      desligado: false,
      organizacoes: resumos,
      organizacoes_puladas: agenda.suspensas.length,
    },
    { requestId },
  );
}

export const GET = handle;
export const POST = handle;
