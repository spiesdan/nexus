/**
 * GET /api/v1/automatic-sales/campaigns/[id]/painel — resumo (§21) + timeline
 * (§22) em uma ida só: a tela do detalhe da campanha pede as duas de uma vez.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { fusoSeguro, relogioNoFuso } from "@/lib/venda-automatica/janela";
import { resumoDaCampanha, timelineDaCampanha } from "@/lib/venda-automatica/metricas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "automatic_sales_campaigns" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const supabase = await createClient();

  const { data: campanha, error } = await supabase
    .from("automatic_sales_campaigns")
    .select("id, limite_diario")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (error) return fail("internal_error", "Erro ao ler a campanha.", 500, { requestId });
  if (!campanha) return fail("not_found", "Campanha não encontrada.", 404, { requestId });

  // O dia é o da ORGANIZAÇÃO (a mesma regra da janela — ver janela.ts): o cron
  // roda em UTC e a cota vira a data de quem vai ler.
  const { data: org } = await supabase
    .from("organizations")
    .select("timezone")
    .eq("id", authz.org.orgId)
    .maybeSingle();
  const fuso = fusoSeguro((org as { timezone?: string | null } | null)?.timezone);
  const { dia } = relogioNoFuso(new Date().toISOString(), fuso);

  const linha = campanha as unknown as { limite_diario: number };
  const [resumo, eventos] = await Promise.all([
    resumoDaCampanha(supabase, authz.org.orgId, id, dia, linha.limite_diario),
    timelineDaCampanha(supabase, authz.org.orgId, id),
  ]);

  return ok({ dia, resumo, eventos }, { requestId });
}
