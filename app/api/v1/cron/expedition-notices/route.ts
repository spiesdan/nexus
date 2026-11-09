/**
 * GET|POST /api/v1/cron/expedition-notices — drena a fila do aviso de rota.
 *
 * O aviso "seu pedido saiu para entrega" só sai pelo número marcado como
 * expedição. Quando ele está fora do ar, a rota grava o fato em
 * `shipment_notices` (pendente) e este tick entrega quando a sessão volta a
 * `WORKING`. Nada sai pelo comercial — nem como último recurso.
 *
 * Roda a cada minuto no self-host. Um tick barato é o que faz o aviso chegar
 * logo depois da reconexão, em vez de esperar o próximo lote de outra rotina.
 * Auth: mesmo contrato dos demais crons (Bearer INTERNAL_CRON_SECRET|
 * INTERNAL_SECRET, fail-closed). O resumo só aparece no log quando houve
 * efeito — silêncio de fila vazia é saúde, não ausência.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { entregarAvisosPendentes } from "@/lib/expedicao/aviso-de-carga";
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
    const resumo = await entregarAvisosPendentes(createAdminClient(), { limit: 200 });
    if (resumo.enviados > 0 || resumo.falharam > 0) {
      logger.info("[expedition-notices.cron] tick", { requestId, ...resumo });
    }
    return ok(resumo, { requestId });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error("[expedition-notices.cron] threw", { error: detail, requestId });
    return fail("internal_error", detail, 500, { requestId });
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}
