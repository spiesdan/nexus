/**
 * GET /api/v1/prospecting/relatorio-gastos — visão mensal por campanha.
 *
 * `?formato=csv` devolve o mesmo dado em CSV (header e linhas em centavos).
 * Nenhuma tabela nova: orçamento das colunas da campanha (0337), gasto real de
 * `prospecting_searches`, mídia de `prospecting_campaign_spend` (lançamento
 * manual). Guard de 80/100 reaproveitado de `simulacao-gastos.ts`.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";
import { inicioDoMesUtc } from "@/lib/prospeccao/uso";
import {
  montarRelatorio,
  relatorioParaCsv,
  type LinhaDeGasto,
} from "@/lib/prospeccao/relatorio-gastos";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = req.headers.get("x-request-id") ?? undefined;
  const autorizado = await requireRole("manager", { requestId, resource: "prospecting_consumo" });
  if (!autorizado.ok) return autorizado.response;
  const orgId = autorizado.org.orgId;
  const desde = inicioDoMesUtc();
  const formato = req.nextUrl.searchParams.get("formato") ?? "json";
  if (formato !== "json" && formato !== "csv") {
    return fail("validation_failed", "formato deve ser json ou csv.", 422, { requestId });
  }

  const supabase = await createClient();
  const admin = createAdminClient();
  const [{ data: campanhas, error: erroCampanhas }, { data: settings }] = await Promise.all([
    supabase
      .from("prospecting_campaigns")
      .select("id, nome, orcamento_prospeccao_cents, orcamento_midia_cents")
      .eq("organization_id", orgId),
    admin
      .from("prospecting_settings")
      .select("orcamento_mensal_cents")
      .eq("organization_id", orgId)
      .maybeSingle(),
  ]);
  if (erroCampanhas) {
    logger.warn("[relatorio.gastos] campanhas indisponíveis", { requestId, erro: erroCampanhas.message });
    return fail("internal_error", "Não foi possível ler as campanhas.", 500, { requestId });
  }

  const [{ data: buscas }, { data: midia }] = await Promise.all([
    admin
      .from("prospecting_searches")
      .select("campaign_id, custo_estimado_cents")
      .eq("organization_id", orgId)
      .gte("created_at", desde),
    admin
      .from("prospecting_campaign_spend")
      .select("campaign_id, valor_cents")
      .eq("organization_id", orgId)
      .gte("data", desde.slice(0, 10)),
  ]);

  const somaPorCampanha = (
    linhas: readonly Record<string, unknown>[] | null,
    campo: "custo_estimado_cents" | "valor_cents",
  ): Map<string, number> => {
    const mapa = new Map<string, number>();
    for (const linha of linhas ?? []) {
      const campanha = linha.campaign_id;
      if (typeof campanha !== "string") continue;
      mapa.set(campanha, (mapa.get(campanha) ?? 0) + (Number(linha[campo]) || 0));
    }
    return mapa;
  };
  const prospeccao = somaPorCampanha(
    buscas as unknown as readonly Record<string, unknown>[] | null,
    "custo_estimado_cents",
  );
  const midiaPorCampanha = somaPorCampanha(
    midia as unknown as readonly Record<string, unknown>[] | null,
    "valor_cents",
  );

  const linhas: LinhaDeGasto[] = (campanhas ?? []).map((c) => ({
    campanha_id: String(c.id),
    nome: String(c.nome ?? ""),
    orcamento_prospeccao_cents: c.orcamento_prospeccao_cents == null ? null : Number(c.orcamento_prospeccao_cents),
    orcamento_midia_cents: c.orcamento_midia_cents == null ? null : Number(c.orcamento_midia_cents),
    gasto_prospeccao_cents: prospeccao.get(String(c.id)) ?? 0,
    midia_lancada_cents: midiaPorCampanha.get(String(c.id)) ?? 0,
  }));
  const relatorio = montarRelatorio(
    linhas,
    settings?.orcamento_mensal_cents == null ? null : Number(settings.orcamento_mensal_cents),
  );

  // A lista de campanhas é tenant-aware via client de SESSÃO; as somas vêm do
  // admin com `.eq("organization_id")` explícito (service role não tem RLS).
  if (formato === "csv") {
    return new Response(relatorioParaCsv(relatorio), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="relatorio-gastos-${desde.slice(0, 10)}.csv"`,
        "x-request-id": requestId ?? randomUUID(),
      },
    });
  }
  return ok({ desde, campanhas: relatorio }, { requestId });
}
