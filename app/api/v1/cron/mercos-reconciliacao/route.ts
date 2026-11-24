/**
 * GET|POST /api/v1/cron/mercos-reconciliacao — o tick diário da reconciliação.
 *
 * Agendado às 21:00 UTC, depois do tick do `mercos-import` das 20:00. Só
 * ENFILEIRA: o worker dedicado coleta o censo (`--lista-saida`) e roda a
 * reconciliação **sem `--aplicar`**. Detectar e mostrar é obrigação do
 * sistema; importar sozinho é decisão do dono. O resultado aparece no
 * `GET /api/v1/mercos/colisoes` (bloco `reconciliacao` da tela).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { enfileirarImportacaoMercos, organizacoesComMercos } from "@/lib/mercos/importacao";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  const headerSecret = req.headers.get("x-cron-secret")?.trim() ?? "";
  const provided = bearer || headerSecret;
  const aceitos: string[] = [];
  if (env.INTERNAL_CRON_SECRET) aceitos.push(env.INTERNAL_CRON_SECRET);
  if (env.INTERNAL_SECRET) aceitos.push(env.INTERNAL_SECRET);
  if (aceitos.length === 0 || !provided || !aceitos.includes(provided)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }

  try {
    const admin = createAdminClient();
    const orgs = await organizacoesComMercos(admin);
    const enfileiradas: Array<{ organization_id: string; run_id: string; ja_estava_rodando: boolean }> = [];
    for (const organizationId of orgs) {
      const { execucao, jaEstavaRodando } = await enfileirarImportacaoMercos(admin, {
        organizationId,
        requestedBy: null,
        origem: "cron",
      });
      if (execucao?.tipo !== "reconciliacao") {
        const { error } = await admin
          .from("mercos_import_runs")
          .update({ tipo: "reconciliacao" })
          .eq("id", execucao.id)
          .eq("organization_id", organizationId);
        if (error) throw error;
      }
      enfileiradas.push({ organization_id: organizationId, run_id: execucao.id, ja_estava_rodando: jaEstavaRodando });
    }
    logger.info("[mercos-reconciliacao.cron] tick", { requestId, organizacoes: enfileiradas.length });
    return ok({ organizacoes: enfileiradas, aplicar: false }, { requestId });
  } catch (err) {
    const detalhe = err instanceof Error ? err.message : String(err);
    logger.error("[mercos-reconciliacao.cron] threw", { error: detalhe, requestId });
    return fail("internal_error", detalhe, 500, { requestId });
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}
