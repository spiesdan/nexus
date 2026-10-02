/**
 * GET /api/v1/prospecting/consumo — painel "Consumo de Prospecção" (§21).
 *
 * Manager+ (mesmo guard da configuração: é lá que o teto e os preços moram).
 * Todos os números vêm da MESMA régua que o budget guard usa
 * (`lib/prospeccao/uso.ts`) — o que o painel mostra é o que decide, nunca uma
 * segunda medição. "Cache misses" = buscas criadas no período (o hit de cache
 * não cria busca nova, e por isso o hit é contado à parte, na tabela de hits).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";
import {
  alertaDoOrcamento,
  consumoDoPeriodo,
  estadoDoOrcamento,
  inicioDoDiaUtc,
  inicioDoMesUtc,
} from "@/lib/prospeccao/uso";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "prospecting_consumo" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const { data: settings, error } = await supabase
    .from("prospecting_settings")
    .select("provider_ativo, orcamento_mensal_cents")
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();

  if (error) {
    logger.error("[prospecting.consumo] falha ao ler o consumo", {
      requestId,
      organization_id: authz.org.orgId,
      erro: error.message,
    });
    return fail("internal_error", "Erro ao ler o consumo.", 500, { requestId });
  }

  const linha = settings as unknown as {
    provider_ativo: string | null;
    orcamento_mensal_cents: number | null;
  } | null;
  const limiteCents = linha?.orcamento_mensal_cents ?? null;

  const [hoje, mes] = await Promise.all([
    consumoDoPeriodo(supabase, authz.org.orgId, inicioDoDiaUtc()),
    consumoDoPeriodo(supabase, authz.org.orgId, inicioDoMesUtc()),
  ]);

  const orcamento = estadoDoOrcamento(mes.custo_cents, limiteCents);

  return ok(
    {
      // Sem linha de settings, o mesmo default honesto do motor (OSM grátis).
      provider_ativo: linha?.provider_ativo ?? "osm_overpass",
      hoje: { consultas: hoje.consultas },
      mes: {
        consultas: mes.consultas,
        hits: mes.hits,
        misses: mes.buscas,
        descobertas: mes.descobertas,
        novas: mes.novas,
        enriquecimentos: mes.enriquecimentos,
        custo_cents: mes.custo_cents,
      },
      orcamento: {
        limite_cents: orcamento.limite_cents,
        gasto_cents: orcamento.gasto_cents,
        pct: orcamento.pct,
        estado: orcamento.estado,
        alerta: alertaDoOrcamento(orcamento),
      },
    },
    { requestId },
  );
}
