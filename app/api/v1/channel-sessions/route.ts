/**
 * GET  /api/v1/channel-sessions — lista os canais WhatsApp da org (do DB).
 *   Acessível a qualquer membro (usado pelo seletor do inbox e pela sidebar).
 * POST /api/v1/channel-sessions — conecta um NOVO número (cria a sessão com
 *   nome único e inicia no WAHA). Admin only.
 *
 * organization_id resolvido da sessão (cookie) — nunca do body.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { ok, fail } from "@/lib/api/wrappers";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { requireRole } from "@/lib/auth/require-role";
import { ARCHIVED_AT, queryTolerantToMissingArchived } from "@/lib/channels/archived";
import { finalidadeDoCanal, type Finalidade } from "@/lib/channels/finalidade";
import {
  CANAIS_PERMITIDOS,
  canalVisivelPara,
  interpretarLeituraDeCanais,
} from "@/lib/channels/visibilidade";
import { createChannelSchema } from "@/lib/schemas/channels";
import { createClient } from "@/lib/supabase/server";
import { getWahaClient, wahaFriendlyError } from "@/lib/waha/client";

export const dynamic = "force-dynamic";

export const CHANNEL_COLUMNS =
  "id, waha_session_name, display_name, phone_number, status, status_reason, last_health_check_at, last_status_change_at, daily_message_limit, is_warmup_complete, created_at, metadata";

/**
 * A resposta fala em `finalidade`, não no jsonb onde ela mora.
 *
 * O `metadata` é detalhe de armazenamento: a tela precisa saber se o número é
 * comercial ou de expedição, e nada além disso. Devolver o jsonb cru faria cada
 * consumidor reimplementar a leitura — e a regra "valor estranho cai em
 * comercial" mora em `finalidadeDoCanal`, um lugar só.
 */
function comFinalidadeNaResposta<T extends { metadata?: unknown }>(
  canal: T,
): Omit<T, "metadata"> & { finalidade: Finalidade } {
  const { metadata, ...resto } = canal;
  return { ...resto, finalidade: finalidadeDoCanal(metadata) };
}

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const user = await loadAuthUser();
  if (!user) return fail("unauthenticated", "Auth required.", 401, { requestId });
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) return fail("forbidden_tenant", "Nenhuma organização ativa.", 403, { requestId });

  const supabase = await createClient();
  const base = () =>
    supabase
      .from("channel_sessions")
      .select(CHANNEL_COLUMNS)
      .eq("organization_id", activeOrg.orgId);
  // Canais arquivados sobrevivem só como âncora das FKs RESTRICT
  // (conversations/messages). Para o usuário eles foram excluídos.
  //
  // Tolerante à coluna ausente porque esta é a PRIMEIRA tela de quem já tem
  // número ligado: num clone que subiu o código sem a migration 0106, o filtro
  // devolveria 42703 → 500 → "Nenhum número conectado ainda", convidando o
  // operador a parear de novo um número que já está no ar. Sem a coluna, nada
  // está arquivado, e a lista sem o filtro é a lista certa (ver lib/channels/archived).
  const { data, error, schemaOutdated } = await queryTolerantToMissingArchived(
    () => base().is(ARCHIVED_AT, null).order("created_at", { ascending: true }),
    () => base().order("created_at", { ascending: true }),
  );
  if (error) return fail("internal_error", error.message, 500, { requestId });

  /*
   * Quais números ESTE membro enxerga no inbox (0296).
   *
   * A verdade é a RLS (`fn_can_view_channel`); o campo `visivel_no_inbox`
   * existe para a tela não oferecer no seletor um número que devolveria zero
   * conversas. Platform admin não é escopado — a policy também não o escopa.
   *
   * A leitura é tolerante à coluna ausente: sem a migration, todos veem todos,
   * que é o estado anterior. A Central de Conexões continua listando TODOS os
   * canais (é onde o admin pareia e exclui número) — só o inbox filtra.
   */
  const { data: membro, error: membroErr } = await supabase
    .from("user_organizations")
    .select(CANAIS_PERMITIDOS)
    .eq("organization_id", activeOrg.orgId)
    .eq("user_id", user.id)
    .maybeSingle();
  const leitura = interpretarLeituraDeCanais({ data: membro, error: membroErr });
  if (!leitura.ok) return fail("internal_error", leitura.message, 500, { requestId });
  const permitidos = user.is_platform_admin ? null : leitura.canais;

  const canais = (data ?? []).map((canal) => ({
    ...comFinalidadeNaResposta(canal),
    visivel_no_inbox: canalVisivelPara(permitidos, canal.id),
  }));

  const meta: Record<string, boolean> = {};
  if (schemaOutdated) meta.schema_outdated = true;
  if (leitura.schemaOutdated) meta.canais_schema_outdated = true;

  return ok(canais, {
    requestId,
    ...(Object.keys(meta).length > 0 ? { meta } : {}),
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("admin", {
    requestId,
    resource: "channel_sessions",
    allowPlatformAdmin: true,
  });
  if (!authz.ok) return authz.response;
  const { user, org: activeOrg } = authz;

  const waha = getWahaClient();
  if (!waha) {
    return fail(
      "waha_not_configured",
      "O WhatsApp (WAHA) não está configurado neste ambiente: faltam WAHA_API_BASE_URL e/ou WAHA_API_KEY. Configure-as e tente de novo.",
      503,
      { requestId },
    );
  }

  let raw: unknown = {};
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  const parsed = createChannelSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const supabase = await createClient();
  // Nome de sessão único por canal — o hardcode `org_<8>` era 1 número por org.
  const sessionName = `org_${activeOrg.orgId.slice(0, 8)}_${randomUUID().replace(/-/g, "").slice(0, 6)}`;

  const { data: created, error: insErr } = await supabase
    .from("channel_sessions")
    .insert({
      organization_id: activeOrg.orgId,
      waha_session_name: sessionName,
      display_name: parsed.data.display_name ?? null,
      engine: "NOWEB",
      webhook_path_token: randomUUID().replace(/-/g, ""),
      webhook_secret_encrypted: Buffer.from([0]),
      status: "STARTING",
      last_status_change_at: new Date().toISOString(),
      consecutive_health_fails: 0,
      daily_message_limit: 250,
      metadata: {},
    })
    .select(CHANNEL_COLUMNS)
    .single();
  if (insErr || !created) {
    return fail("internal_error", insErr?.message ?? "channel_session_insert_failed", 500, {
      requestId,
    });
  }

  try {
    await waha.startSession(sessionName);
  } catch (err) {
    // Rollback: sem WAHA no ar, não deixamos um canal fantasma preso em STARTING.
    await supabase
      .from("channel_sessions")
      .delete()
      .eq("organization_id", activeOrg.orgId)
      .eq("id", created.id);
    return fail("waha_error", wahaFriendlyError(err), 502, { requestId });
  }

  void audit({
    action: "channel.connected",
    actorUserId: user.id,
    organizationId: activeOrg.orgId,
    resourceType: "channel_session",
    resourceId: created.id,
    requestId,
    metadata: { waha_session_name: sessionName },
  });

  return ok(comFinalidadeNaResposta(created), { requestId, status: 201 });
}
