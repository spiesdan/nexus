/**
 * GET/POST /api/v1/cron/prospecting-fit — a qualificação automática.
 *
 * O MESMO molde do `prospecting-drain` e do `risk-watcher`: quem grava o
 * estado do radar não espera o humano abrir a tela. Aqui quem grava o
 * "potencial / duvidoso / sem_potencial" do prospect é o motor local — este
 * cron é o que faz o carimbo acontecer sozinho.
 *
 * Auth: Bearer INTERNAL_CRON_SECRET | INTERNAL_SECRET, fail-closed.
 *
 * Cadência: a cada 5 min no scheduler — a qualificação é menos urgente que
 * a busca, e o teto (LAYA_FIT_POR_TICK=32) varre o acervo novo aos poucos.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { qualificaProspects, motorFitLigado } from "@/lib/prospeccao/laya-fit";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const ORG_LIMIT = 50;

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  const accepted = [env.INTERNAL_CRON_SECRET, env.INTERNAL_SECRET].filter(Boolean);
  if (accepted.length === 0 || !provided || !accepted.includes(provided)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }

  // Motor desligado (sem LAYA_URL) é NENHUM trabalho: não consulta org, não
  // loga warning por org — em dev todo tick falaria o mesmo aviso.
  if (!motorFitLigado()) {
    return ok({ organizations: 0, qualificados: 0, desligada: true }, { requestId });
  }

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("business_prospects")
    .select("organization_id")
    .eq("status_comercial", "novo")
    .is("laya_fit", null)
    .limit(500);
  if (error) {
    logger.error("[prospecting-fit] query failed", { error: error.message, requestId });
    return fail("internal_error", "Failed to list organizations.", 500, { requestId });
  }
  const orgs = [
    ...new Set(((rows ?? []) as Array<{ organization_id: string }>).map((r) => r.organization_id)),
  ].slice(0, ORG_LIMIT);

  let qualificados = 0;
  let falhas = 0;
  for (const org of orgs) {
    try {
      const r = await qualificaProspects(admin, org, new Date());
      qualificados += r.qualificados;
      if (r.falhou) falhas += 1;
    } catch (e) {
      falhas += 1;
      logger.error("[prospecting-fit] org falhou", {
        organizationId: org,
        error: e instanceof Error ? e.message : String(e),
        requestId,
      });
    }
  }
  return ok({ organizations: orgs.length, qualificados, falhas, desligada: false }, { requestId });
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}
export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}
