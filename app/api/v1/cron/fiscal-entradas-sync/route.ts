/**
 * POST /api/v1/cron/fiscal-entradas-sync — o tick da entrada de NF-e.
 *
 * Mesmo contrato dos outros crons (Bearer `INTERNAL_CRON_SECRET`, admin client,
 * resumo JSON), chamado pelo scheduler da VPS.
 *
 * Ele NÃO tem regra própria: chama `sincronizarEntrada()`, a mesma função do
 * botão "Sincronizar agora". O que este arquivo decide é só QUEM entra no tick:
 *
 *   - `entrada_ativa = true`;
 *   - passou `frequencia_minutos` desde a última sincronização;
 *   - o cursor não está em backoff (`proxima_tentativa`).
 *
 * Quem está com o lease preso (execução em andamento) é recusado pela própria
 * função e aparece no resumo como `bloqueado` — não é erro.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { env } from "@/lib/env";
import { sincronizarEntrada } from "@/lib/fiscal/entrada-sync";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const ORGANIZACOES_POR_TICK = 5;

interface ConfigDaEntrada {
  organization_id: string;
  frequencia_minutos: number | null;
  ultima_sincronizacao: string | null;
}

interface CursorDaEntrada {
  organization_id: string;
  proxima_tentativa: string | null;
}

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
    const agora = Date.now();

    const { data: configsRaw } = await admin
      .from("fiscal_settings")
      .select("organization_id, frequencia_minutos, ultima_sincronizacao")
      .eq("entrada_ativa", true)
      .limit(200);
    const configs = (configsRaw ?? []) as unknown as ConfigDaEntrada[];

    const { data: cursoresRaw } = await admin
      .from("fiscal_entrada_cursor")
      .select("organization_id, proxima_tentativa");
    const backoff = new Map(
      ((cursoresRaw ?? []) as unknown as CursorDaEntrada[]).map((c) => [
        c.organization_id,
        c.proxima_tentativa ? Date.parse(c.proxima_tentativa) : 0,
      ]),
    );

    const vencidas = configs
      .filter((c) => {
        if ((backoff.get(c.organization_id) ?? 0) > agora) return false;
        if (!c.ultima_sincronizacao) return true;
        const intervalo = Math.max(1, c.frequencia_minutos ?? 60) * 60_000;
        return Date.parse(c.ultima_sincronizacao) + intervalo <= agora;
      })
      .slice(0, ORGANIZACOES_POR_TICK);

    const resumo = {
      organizacoes: vencidas.length,
      importados: 0,
      atualizados: 0,
      erros: 0,
      bloqueadas: 0,
    };

    for (const cfg of vencidas) {
      const r = await sincronizarEntrada({
        admin,
        organizationId: cfg.organization_id,
        usuarioId: null,
        origem: "cron",
        requestId,
      });
      if (r.bloqueado) resumo.bloqueadas++;
      resumo.importados += r.importados;
      resumo.atualizados += r.atualizados;
      resumo.erros += r.erros;
    }

    return ok(resumo, { requestId });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error("[fiscal-entradas-sync.cron] threw", { error: detail, requestId });
    return fail("internal_error", detail, 500, { requestId });
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}
