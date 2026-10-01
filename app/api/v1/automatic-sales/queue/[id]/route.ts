/**
 * POST /api/v1/automatic-sales/queue/[id] — as ações humanas na fila (§4/§18).
 *
 *   ignorar      → apaga a linha (o prospect NÃO some: volta na próxima
 *                  varrida se ainda for elegível)
 *   bloquear     → opt-out de verdade (`do_not_contact` + contato bloqueado) e
 *                  apaga a linha — a próxima campanha nem considera
 *   reenfileirar → `failed → queued` (a IA ou o canal voltaram; a linha retoma)
 *   assumir      → humano assumiu: follow-ups param nesta linha
 *
 * Toda ação também vira evento na timeline (§22) e linha na auditoria.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { acaoDaFilaSchema } from "@/lib/venda-automatica/schemas";
import { registrarEvento } from "@/lib/venda-automatica/eventos";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "automatic_sales_campaigns" });
  if (!authz.ok) return authz.response;

  const parsed = acaoDaFilaSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const { id } = await params;
  const supabase = await createClient();

  const { data: linha, error } = await supabase
    .from("automatic_sales_queue")
    .select("id, campaign_id, prospect_id, contact_id, conversation_id, status, snapshot")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();

  if (error || !linha) return fail("not_found", "Linha não encontrada.", 404, { requestId });
  const row = linha as unknown as {
    id: string;
    campaign_id: string;
    prospect_id: string | null;
    contact_id: string | null;
    conversation_id: string | null;
    status: string;
    snapshot: { nome?: string };
  };
  const acao = parsed.data.acao;

  if (acao === "ignorar") {
    await registrarEvento(supabase, {
      organizationId: authz.org.orgId,
      campaignId: row.campaign_id,
      queueId: row.id,
      tipo: "ignorada",
      payload: { motivo: parsed.data.motivo ?? null, nome: row.snapshot.nome },
    });
    await supabase
      .from("automatic_sales_queue")
      .delete()
      .eq("id", row.id)
      .eq("organization_id", authz.org.orgId);
  } else if (acao === "bloquear") {
    if (row.prospect_id) {
      await supabase
        .from("business_prospects")
        .update({
          do_not_contact: true,
          status_comercial: "sem_interesse",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.prospect_id)
        .eq("organization_id", authz.org.orgId);
    }
    if (row.contact_id) {
      await supabase
        .from("contacts")
        .update({
          is_blocked: true,
          blocked_reason: parsed.data.motivo ?? "bloqueado pela Venda Automática",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.contact_id)
        .eq("organization_id", authz.org.orgId);
    }
    await registrarEvento(supabase, {
      organizationId: authz.org.orgId,
      campaignId: row.campaign_id,
      queueId: row.id,
      tipo: "bloqueado",
      payload: { motivo: parsed.data.motivo ?? "acao_humana", nome: row.snapshot.nome },
    });
    await supabase
      .from("automatic_sales_queue")
      .delete()
      .eq("id", row.id)
      .eq("organization_id", authz.org.orgId);
  } else if (acao === "reenfileirar") {
    const { data: mudou } = await supabase
      .from("automatic_sales_queue")
      .update({ status: "queued", rejection_reason: null, updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("organization_id", authz.org.orgId)
      .eq("status", "failed")
      .select("id");
    if (!mudou || mudou.length === 0) {
      return fail("conflict", "Só linhas com falha podem voltar para a fila.", 409, { requestId });
    }
    await registrarEvento(supabase, {
      organizationId: authz.org.orgId,
      campaignId: row.campaign_id,
      queueId: row.id,
      tipo: "reenfileirada",
      payload: { motivo: parsed.data.motivo ?? null },
    });
  } else {
    // assumir — para os follow-ups desta linha; quem responde daqui é humano.
    const { data: mudou } = await supabase
      .from("automatic_sales_queue")
      .update({ proximo_followup_at: null, updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("organization_id", authz.org.orgId)
      .eq("status", "contacted")
      .select("id");
    if (!mudou || mudou.length === 0) {
      return fail("conflict", "Só linhas aguardando follow-up podem ser assumidas.", 409, {
        requestId,
      });
    }
    await registrarEvento(supabase, {
      organizationId: authz.org.orgId,
      campaignId: row.campaign_id,
      queueId: row.id,
      tipo: "humano_assumiu",
      payload: { por: authz.user.id },
    });
  }

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "automatic_sales.queue_action",
    resourceType: "automatic_sales_queue",
    resourceId: row.id,
    metadata: { acao, campaign_id: row.campaign_id, motivo: parsed.data.motivo ?? null },
    requestId,
  });

  return ok({ id: row.id, acao }, { requestId });
}
