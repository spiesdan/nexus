/**
 * GET|POST /api/v1/cron/mercos-import — o tick das 17h.
 *
 * Chamado pelo scheduler da VPS. Enfileira uma execução por organização que
 * já tem histórico Mercos; o worker dedicado faz o resto. O tick não abre
 * navegador e não depende de o worker estar acordado no mesmo instante — a
 * fila sobrevive a restart.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  enfileirarImportacaoMercos,
  organizacoesComMercos,
} from "@/lib/mercos/importacao";
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
    const admin = createAdminClient();
    const orgs = await organizacoesComMercos(admin);
    const resultados: Array<{ organization_id: string; run_id: string; ja_estava_rodando: boolean }> = [];
    for (const organizationId of orgs) {
      const { execucao, jaEstavaRodando } = await enfileirarImportacaoMercos(admin, {
        organizationId,
        requestedBy: null,
        origem: "cron",
      });
      resultados.push({
        organization_id: organizationId,
        run_id: execucao.id,
        ja_estava_rodando: jaEstavaRodando,
      });
    }
    logger.info("[mercos-import.cron] tick", { requestId, organizacoes: resultados.length });
    return ok({ organizacoes: resultados }, { requestId });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error("[mercos-import.cron] threw", { error: detail, requestId });
    return fail("internal_error", detail, 500, { requestId });
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}
