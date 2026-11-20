/**
 * POST /api/internal/observabilidade/sonda — prova que o instrumento grava.
 *
 * Auth: `Authorization: Bearer <INTERNAL_CRON_SECRET|INTERNAL_SECRET>`.
 *
 * Grava em `api_request_probes` (0332), NÃO em `api_request_samples`: a sonda
 * não pode mexer na contagem/idade/retenção da série que alimenta os SLOs. Se
 * ela funciona e a série continua zero, o problema é tráfego, não instrumento.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { registrarSonda } from "@/lib/observabilidade/rotas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  origem: z.enum(["cron", "manual"]).default("manual"),
});

function autorizado(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  const aceitos = [env.INTERNAL_CRON_SECRET, env.INTERNAL_SECRET].filter(Boolean);
  return aceitos.length > 0 && provided.length > 0 && aceitos.includes(provided);
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  if (!autorizado(req)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }

  let bruto: unknown = {};
  try {
    bruto = await req.json();
  } catch {
    // Corpo vazio é válido: a sonda usa `manual` por padrão.
  }
  const parsed = bodySchema.safeParse(bruto);
  if (!parsed.success) {
    return fail("validation_error", "Origem inválida.", 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  try {
    const sonda = await registrarSonda(parsed.data.origem);
    return ok(sonda, { requestId });
  } catch (erro) {
    logger.error("observabilidade.sonda_falhou", {
      requestId,
      erro: erro instanceof Error ? erro.message : String(erro),
    });
    return fail("internal_error", "A sonda não conseguiu gravar.", 500, { requestId });
  }
}
