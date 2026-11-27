/**
 * GET /api/v1/prospecting/settings — config (chave NUNCA volta; só tem_chave).
 * PUT /api/v1/prospecting/settings — grava (manager; chave cifra na hora).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";
import { settingsPutSchema } from "@/lib/schemas/prospeccao";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolverChaveGoogle } from "@/lib/prospeccao/chave";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";

export const dynamic = "force-dynamic";

const COLUNAS =
  "provider_ativo, limite_por_busca, limite_diario, grid_size_km, raio_padrao_km, " +
  "concorrencia, retries, timeout_ms, requisicoes_por_minuto, cache_ttl_dias, " +
  "orcamento_mensal_cents, preco_busca_cents, preco_detalhe_cents, updated_at";

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "prospecting_settings" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospecting_settings")
    .select(`${COLUNAS}, google_api_key_encrypted`)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();

  if (error) {
    logger.error("[prospecting.settings] falha ao ler a configuração", {
      requestId,
      organization_id: authz.org.orgId,
      erro: error.message,
    });
    return fail("internal_error", "Erro ao ler a configuração.", 500, { requestId });
  }
  // A tela precisa saber DE QUEM é a chave, não só se existe: o custo do
  // Google pode ser do dono da instalação. O resolver devolve a origem
  // (tenant → instalação → nenhuma) e a chave NUNCA entra na resposta.
  const chave = await resolverChaveGoogle(createAdminClient(), authz.org.orgId);
  if (!data) {
    return ok(
      {
        configurado: false,
        tem_chave: chave.chave !== null,
        chave_origem: chave.origem,
      },
      { requestId },
    );
  }
  const linha = data as unknown as Record<string, unknown> & { google_api_key_encrypted: unknown };
  const { google_api_key_encrypted: _, ...resto } = linha;
  return ok(
    {
      configurado: true,
      tem_chave: chave.chave !== null,
      chave_origem: chave.origem,
      ...resto,
    },
    { requestId },
  );
}

export async function PUT(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "prospecting_settings" });
  if (!authz.ok) return authz.response;

  const parsed = settingsPutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const detalhes = parsed.error.flatten().fieldErrors as Record<string, unknown>;
    const doProvider = parsed.error.issues.find((i) => i.path[0] === "provider_ativo");
    return fail(
      "validation_failed",
      doProvider?.message ?? "Dados inválidos.",
      422,
      { requestId, details: detalhes },
    );
  }

  const { google_api_key, ...resto } = parsed.data;
  let chaveCifrada: string | undefined;
  if (google_api_key !== undefined && google_api_key !== null && google_api_key !== "") {
    const admin = createAdminClient();
    const enc = await encryptWebhookSecret(admin, google_api_key);
    if (enc === null) {
      return fail("validation_failed", "Cifra indisponível (chave de criptografia ausente no servidor).", 422, { requestId });
    }
    chaveCifrada = enc;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospecting_settings")
    .upsert(
      {
        organization_id: authz.org.orgId,
        ...resto,
        ...(chaveCifrada !== undefined ? { google_api_key_encrypted: chaveCifrada } : {}),
      },
      { onConflict: "organization_id" },
    )
    .select(COLUNAS)
    .single();

  if (error || !data) {
    logger.error("[prospecting.settings] falha ao salvar a configuração", {
      requestId,
      organization_id: authz.org.orgId,
      erro: error?.message ?? "sem linha devolvida",
    });
    return fail("internal_error", "Erro ao salvar a configuração.", 500, { requestId });
  }

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "prospecting_settings.updated",
    resourceType: "prospecting_settings",
    resourceId: authz.org.orgId,
    requestId,
  });

  return ok({ configurado: true, tem_chave: true, ...(data as unknown as Record<string, unknown>) }, { requestId });
}
