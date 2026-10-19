/**
 * GET|POST /api/v1/cron/prospecting-send — um tick do agendamento da prospecção.
 *
 * Mesmo molde de `prospecting-drain` e `automatic-sales`: Bearer
 * INTERNAL_CRON_SECRET (ou INTERNAL_SECRET), admin client, resumo JSON. Chamado
 * a cada minuto pelo scheduler da VPS; em dev, `pnpm dev:crons` inclui a rota.
 *
 * O motor (`lib/prospeccao/agendado.ts`) passa pelas campanhas `ativa` com
 * `agendada_em` preenchido e manda UMA mensagem — dentro do período, da janela,
 * da cota do dia e do intervalo — devolvendo o resumo contável para este log.
 * Campanha sem prospect restante é encerrada pelo próprio motor.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { processarCampanhasAgendadas } from "@/lib/prospeccao/agendado";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  const headerSecret = req.headers.get("x-cron-secret")?.trim() ?? "";
  const provided = bearer || headerSecret;

  const accepted: string[] = [];
  if (env.INTERNAL_CRON_SECRET) accepted.push(env.INTERNAL_CRON_SECRET);
  if (env.INTERNAL_SECRET) accepted.push(env.INTERNAL_SECRET);

  if (accepted.length === 0 || !provided || !accepted.includes(provided)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }

  try {
    const resumo = await processarCampanhasAgendadas(createAdminClient(), new Date().toISOString());
    // Só loga quando houve EFEITO (envio, campanha encerrada, campanha que
    // venceu o período, ou envio que falhou). Logar cada tick encheria o log de
    // 1.440 linhas/dia dizendo "nada" — e o silêncio, aqui, é o sinal de saúde.
    const teveFalha = resumo.pulados.some(
      (p) => p.motivo === "falha_envio" || p.motivo === "erro",
    );
    if (resumo.enviados > 0 || resumo.concluidas > 0 || resumo.pausadas > 0 || teveFalha) {
      logger.info("[prospecting-send.cron] tick", { requestId, ...resumo });
    }
    return ok(resumo, { requestId });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error("[prospecting-send.cron] threw", { error: detail, requestId });
    return fail("internal_error", detail, 500, { requestId });
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}
