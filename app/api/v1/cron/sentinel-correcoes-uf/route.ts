/**
 * GET|POST /api/v1/cron/sentinel-correcoes-uf — autocorreção determinística.
 *
 * Fora do runner do Sentinel (que é SOMENTE LEITURA por promessa de produto):
 * este job escreve SOMENTE a UF do contato quando o nome do município existe
 * em uma única UF. Homônimo não é corrigido — vira ocorrência no Sentinel.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { corrigirUfDeterministica, decidirCorrecaoUf } from "@/lib/contacts/correcao-uf-sentinel";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const provided = bearer || req.headers.get("x-cron-secret")?.trim() || "";
  const aceitos = [env.INTERNAL_CRON_SECRET, env.INTERNAL_SECRET].filter(Boolean) as string[];
  if (aceitos.length === 0 || !provided || !aceitos.includes(provided)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }

  const admin = createAdminClient();
  const { data: contatos } = await admin
    .from("contacts")
    .select("id, organization_id, cidade, uf")
    .not("cidade", "is", null)
    .not("uf", "is", null)
    .limit(500);
  let corrigidos = 0;
  let ambiguos = 0;
  for (const contato of contatos ?? []) {
    const decisao = decidirCorrecaoUf(contato.cidade, contato.uf);
    if (!decisao.pode) {
      if (decisao.motivo.startsWith("Ambiguidade")) ambiguos++;
      continue;
    }
    const r = await corrigirUfDeterministica(admin, contato.organization_id, contato.id);
    if (r.corrigido) corrigidos++;
  }
  logger.info("[sentinel-correcoes-uf.cron] tick", { requestId, corrigidos, ambiguos });
  return ok({ corrigidos, ambiguos, examinados: contatos?.length ?? 0 }, { requestId });
}

export async function GET(req: NextRequest): Promise<Response> { return handle(req); }
export async function POST(req: NextRequest): Promise<Response> { return handle(req); }
