/**
 * POST /api/v1/cron/automatic-sales — um tick da Venda Automática.
 *
 * Mesmo molde de `prospecting-drain`: Bearer INTERNAL_CRON_SECRET (ou
 * INTERNAL_SECRET), admin client, resumo JSON. Chamado a cada minuto pelo
 * scheduler da VPS; em dev, `pnpm dev:crons` inclui esta rota.
 *
 * O motor (`lib/venda-automatica/motor.ts`) faz os quatro passos — preencher,
 * enviar, follow-up, classificar — e devolve um resumo contável para este log.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { processarTick } from "@/lib/venda-automatica/motor";

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
    const resumo = await processarTick(createAdminClient());
    if (resumo.enviados > 0 || resumo.selecionados > 0 || resumo.classificados > 0) {
      logger.info("[automatic-sales.cron] tick", { requestId, ...resumo });
    }
    return ok(resumo, { requestId });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error("[automatic-sales.cron] threw", { error: detail, requestId });
    return fail("internal_error", detail, 500, { requestId });
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}
