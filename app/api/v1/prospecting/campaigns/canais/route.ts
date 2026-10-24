/**
 * GET /api/v1/prospecting/campaigns/canais — o que a CAMPANHA pode usar.
 *
 * A tela de campanha precisa responder três perguntas antes de deixar o
 * operador escolher texto ou modelo:
 *
 *   1. há canal WORKING que aceite texto livre? (`pode_texto`)
 *   2. há canal WORKING que aceite modelo aprovado? (`pode_template`)
 *   3. quais modelos existem no espelho, e quais realmente servem? (`templates`)
 *
 * O endpoint é próprio, e não o `/api/v1/channels/templates`, por dois motivos:
 * aquele exige `admin` (a campanha é `agent`) e devolve a definição crua; aqui
 * a pergunta é operacional. A leitura do espelho é a MESMA função
 * (`listarTemplatesParaCampanha`) — não há segunda derivação de contrato.
 *
 * Nenhum nome de provider atravessa a resposta: a tela pergunta "pode texto?" e
 * "pode modelo?", não "é WAHA ou Meta?".
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { listarTemplatesParaCampanha } from "@/lib/channels/templates/para-campanha";
import { logger } from "@/lib/logger";
import { canalAceitaTipo, providerAceitaTipo } from "@/lib/prospeccao/canal-da-campanha";
import { sessoesWorkingDaOrg } from "@/lib/prospeccao/validacao-da-campanha";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "prospecting_campaigns" });
  if (!authz.ok) return authz.response;

  const admin = createAdminClient();
  try {
    const [working, todas] = await Promise.all([
      sessoesWorkingDaOrg(admin, authz.org.orgId),
      admin
        .from("channel_sessions")
        .select("id, provider, status")
        .eq("organization_id", authz.org.orgId)
        .is("archived_at", null),
    ]);

    if (todas.error) {
      return fail("internal_error", "Erro ao ler os canais.", 500, { requestId });
    }

    const podeTexto = working.some((s) => canalAceitaTipo(s, "texto"));
    const podeTemplate = working.some((s) => canalAceitaTipo(s, "template"));
    const oficialConectado = ((todas.data ?? []) as Array<{ provider: string | null }>).some(
      (s) => providerAceitaTipo(s.provider, "template"),
    );

    const templates = podeTemplate || oficialConectado
      ? await listarTemplatesParaCampanha(admin, authz.org.orgId)
      : [];

    return ok(
      {
        pode_texto: podeTexto,
        pode_template: podeTemplate,
        oficial_conectado: oficialConectado,
        templates,
      },
      { requestId },
    );
  } catch (e) {
    logger.error("[prospecting.campaigns.canais] falha ao ler canais/modelos", {
      requestId,
      organization_id: authz.org.orgId,
      erro: e instanceof Error ? e.message : String(e),
    });
    return fail("internal_error", "Erro ao ler os canais da campanha.", 500, { requestId });
  }
}
