/**
 * GET /api/v1/prospecting/campaigns/[id]/painel — o funil do §28 (FASE 10):
 * Nome, Objetivo, Região, Categorias + Encontrados → Selecionados →
 * Contatados → Responderam → Qualificados → Oportunidades → Pedidos +
 * Faturamento, tudo calculado do banco real ("não inventar dados").
 *
 * Caminho do join: campanha → buscas (`prospecting_searches.campaign_id`) →
 * resultados (`prospect_search_results`) → prospects → (lead do import,
 * `business_prospects.lead_id`) → crm_leads → contatos → `commercial_orders`.
 * Faturamento é atribuído por contato da campanha com pedido criado DEPOIS da
 * campanha — pedido anterior não foi causado por ela (regra de atribuição
 * documentada em D18 da spec 19).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";
import { contaComoVenda } from "@/lib/comercial/dashboard";
import { porFatias } from "@/lib/db/por-fatias";
import { calcularFunil, type FunilDaCampanha } from "@/lib/prospeccao/funil";
import type { StatusComercial } from "@/lib/schemas/prospeccao";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

interface ProspectLinha {
  status_comercial: StatusComercial;
  owner_user_id: string | null;
  contact_id: string | null;
  lead_id: string | null;
}

export async function GET(_req: NextRequest, { params }: Params): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "prospecting_campaigns" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const org = authz.org.orgId;
  const supabase = await createClient();

  const { data: campanha, error } = await supabase
    .from("prospecting_campaigns")
    .select("id, nome, objetivo, categorias, cidades, created_at")
    .eq("id", id)
    .eq("organization_id", org)
    .maybeSingle();
  if (error) {
    logger.error("[prospecting.painel] falha ao ler a campanha", {
      requestId,
      organization_id: org,
      erro: error.message,
    });
    return fail("internal_error", "Erro ao ler a campanha.", 500, { requestId });
  }
  if (!campanha) return fail("not_found", "Campanha não encontrada.", 404, { requestId });

  const { data: buscas } = await supabase
    .from("prospecting_searches")
    .select("id")
    .eq("organization_id", org)
    .eq("campaign_id", id)
    .limit(500);

  const idsBusca = (buscas ?? []).map((b) => (b as { id: string }).id);
  let prospects: ProspectLinha[] = [];
  if (idsBusca.length > 0) {
    // As três leituras abaixo levam listas que crescem com a campanha (até
    // 10.000 prospects). Em fatias de 100: 500 UUIDs numa URL já devolvem
    // `414 URI too long` do PostgREST e o funil inteiro vira 500 na tela.
    const { linhas: resultados } = await porFatias(idsBusca, async (fatia) => {
      const r = await supabase
        .from("prospect_search_results")
        .select("prospect_id")
        .eq("organization_id", org)
        .in("search_id", fatia)
        .limit(10000);
      return { linhas: (r.data ?? []) as never[], erro: r.error };
    });
    const idsProspect = [
      ...new Set((resultados as { prospect_id: string }[]).map((r) => r.prospect_id)),
    ];
    if (idsProspect.length > 0) {
      const { linhas } = await porFatias(idsProspect, async (fatia) => {
        const r = await supabase
          .from("business_prospects")
          .select("status_comercial, owner_user_id, contact_id, lead_id")
          .eq("organization_id", org)
          .in("id", fatia)
          .limit(10000);
        return { linhas: (r.data ?? []) as never[], erro: r.error };
      });
      prospects = linhas as unknown as ProspectLinha[];
    }
  }

  const idsLead = [...new Set(prospects.map((p) => p.lead_id).filter((v): v is string => !!v))];
  const { linhas: leads } = await porFatias(idsLead, async (fatia) => {
    const r = await supabase
      .from("crm_leads")
      .select("id, contact_id, status")
      .eq("organization_id", org)
      .in("id", fatia);
    return { linhas: (r.data ?? []) as never[], erro: r.error };
  });
  const linhasLead = leads as { contact_id: string | null; status: string }[];
  const oportunidades = linhasLead.filter((l) => l.status === "open").length;

  const contatos = [
    ...new Set(
      [
        ...prospects.map((p) => p.contact_id),
        ...linhasLead.map((l) => l.contact_id),
      ].filter((v): v is string => !!v),
    ),
  ];
  let pedidos = 0;
  let faturamento = 0;
  if (contatos.length > 0) {
    const { linhas: pedidosLinhas } = await porFatias(contatos, async (fatia) => {
      const r = await supabase
        .from("commercial_orders")
        .select("total_cents, status, created_at")
        .eq("organization_id", org)
        .in("contact_id", fatia)
        .gte("created_at", (campanha as { created_at: string }).created_at)
        .limit(5000);
      return { linhas: (r.data ?? []) as never[], erro: r.error };
    });
    for (const linha of pedidosLinhas as { total_cents: number; status: string }[]) {
      if (contaComoVenda(linha.status)) {
        pedidos++;
        faturamento += linha.total_cents;
      }
    }
  }

  const funil: FunilDaCampanha = calcularFunil(prospects, {
    oportunidades,
    pedidos,
    faturamento_cents: faturamento,
  });

  return ok({ campanha, funil }, { requestId });
}
