/**
 * GET  /api/v1/automatic-sales/campaigns — as campanhas de Venda Automática.
 * POST /api/v1/automatic-sales/campaigns — cria campanha (§3).
 *
 * Mesmo molde de `/api/v1/prospecting/campaigns`: zod → requireRole → org
 * explícita → audit → ok. A criação nasce `active` — a janela e a cota já
 * seguram o ritmo; campanha que espera um clique extra para começar é campanha
 * que o operador esquece de ligar.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { campanhaVaCreateSchema } from "@/lib/venda-automatica/schemas";

export const dynamic = "force-dynamic";

const LISTA =
  "id, nome, objetivo, status, cidade, uf, categorias, limite_diario, janela_inicio, janela_fim, " +
  "oferta_produtos, perfil_abordagem, followup_horas, followup_textos, responsavel_user_id, created_at";

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "automatic_sales_campaigns" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("automatic_sales_campaigns")
    .select(LISTA)
    .eq("organization_id", authz.org.orgId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return fail("internal_error", "Erro ao listar campanhas.", 500, { requestId });
  return ok(data ?? [], { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "automatic_sales_campaigns" });
  if (!authz.ok) return authz.response;

  const parsed = campanhaVaCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("automatic_sales_campaigns")
    .insert({
      organization_id: authz.org.orgId,
      nome: parsed.data.nome,
      objetivo: parsed.data.objetivo ?? null,
      status: "active",
      cidade: parsed.data.cidade,
      uf: parsed.data.uf ?? null,
      categorias: parsed.data.categorias,
      limite_diario: parsed.data.limite_diario,
      janela_inicio: parsed.data.janela_inicio,
      janela_fim: parsed.data.janela_fim,
      oferta_produtos: parsed.data.oferta_produtos,
      perfil_abordagem: parsed.data.perfil_abordagem,
      followup_horas: parsed.data.followup_horas,
      followup_textos: parsed.data.followup_textos,
      responsavel_user_id: parsed.data.responsavel_user_id,
      created_by: authz.user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return fail("internal_error", "Erro ao criar campanha.", 500, { requestId });
  }

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "automatic_sales.campaign_created",
    resourceType: "automatic_sales_campaign",
    resourceId: (data as { id: string }).id,
    requestId,
  });

  return ok(data, { requestId, status: 201 });
}
