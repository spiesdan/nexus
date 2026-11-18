/**
 * GET  /api/v1/offline-devices — aparelhos pareados da organização.
 * POST /api/v1/offline-devices — emite credencial de dispositivo (plaintext UMA vez).
 *
 * ─── Quem pode ─────────────────────────────────────────────────────────────
 *
 * `admin`: emitir um bearer que cria pedido em nome de uma pessoa é ato de
 * administração. A mesma régua de `/settings/api-tokens`.
 *
 * ─── O que sai daqui, e o que não sai ──────────────────────────────────────
 *
 * A lista NUNCA devolve token nem hash — só prefixo, nome, escopo, prazo e
 * quando foi visto. A criação devolve o plaintext uma única vez; perdido, gera
 * outro. O token é `nod_<8hex>_<32 bytes base64url>`; o banco guarda o sha256.
 *
 * ─── Rate limit ────────────────────────────────────────────────────────────
 *
 * 10 emissões por hora por organização. Gerar credencial é raro; um laço aqui
 * encheria a tabela e a lista de dispositivos do dono.
 */
import { randomBytes, randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import {
  ESCOPOS_DO_DISPOSITIVO,
  hashDoToken,
  PAPEIS_QUE_CAPTURAM,
  PREFIXO_DO_DISPOSITIVO,
} from "@/lib/auth/device-token";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { createOfflineDeviceSchema } from "@/lib/schemas";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const SELECT_COLS =
  "id, user_id, nome, token_prefix, scopes, last_seen_at, expires_at, revoked_at, created_at";

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "offline_devices" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("offline_devices")
    .select(SELECT_COLS)
    .eq("organization_id", authz.org.orgId)
    .order("created_at", { ascending: false });

  if (error) return fail("internal_error", error.message, 500, { requestId });
  return ok(data ?? [], { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "offline_devices" });
  if (!authz.ok) return authz.response;
  const { user: authUser, org: activeOrg } = authz;

  const limite = await checkRateLimit(`device:criacao:${activeOrg.orgId}`, 10, 3600);
  if (!limite.allowed) {
    return fail("rate_limited", "Muitas credenciais criadas em pouco tempo.", 429, { requestId });
  }

  const parsed = createOfflineDeviceSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }
  const input = parsed.data;

  // ─── De quem é o aparelho ────────────────────────────────────────────────
  //
  // O token assina pedido em nome desta pessoa (`created_by`/`vendedor_user_id`),
  // então precisa ser o vendedor real. Default é quem está criando; escolher
  // outro exige vínculo VIVO com papel que captura — não basta o UUID existir.
  const donoDoAparelho = input.user_id ?? authUser.id;
  const admin = createAdminClient();
  const { data: vinculo, error: erroVinculo } = await admin
    .from("user_organizations")
    .select("role")
    .eq("organization_id", activeOrg.orgId)
    .eq("user_id", donoDoAparelho)
    .is("revoked_at", null)
    .maybeSingle();

  if (erroVinculo) return fail("internal_error", erroVinculo.message, 500, { requestId });
  if (!vinculo) {
    return fail("validation_failed", "A pessoa escolhida não é membro ativo da organização.", 422, {
      requestId,
    });
  }
  const papel = (vinculo as { role: string }).role;
  if (!PAPEIS_QUE_CAPTURAM.has(papel)) {
    return fail(
      "validation_failed",
      "A pessoa escolhida não pode capturar pedidos (papel viewer).",
      422,
      { requestId },
    );
  }

  const prefixo = `${PREFIXO_DO_DISPOSITIVO}${randomBytes(4).toString("hex")}`;
  const segredo = randomBytes(32).toString("base64url");
  const plaintext = `${prefixo}_${segredo}`;
  const expiraEm = new Date(
    Date.now() + input.expires_in_days * 24 * 60 * 60 * 1000,
  ).toISOString();

  const supabase = await createClient();
  const { data: criado, error } = await supabase
    .from("offline_devices")
    .insert({
      organization_id: activeOrg.orgId,
      user_id: donoDoAparelho,
      nome: input.nome,
      token_hash: hashDoToken(plaintext),
      token_prefix: prefixo,
      scopes: [...ESCOPOS_DO_DISPOSITIVO],
      expires_at: expiraEm,
    })
    .select(SELECT_COLS)
    .single();

  if (error || !criado) {
    return fail("internal_error", error?.message ?? "Erro ao criar a credencial.", 500, {
      requestId,
    });
  }

  await audit({
    action: "offline_device.created",
    actorUserId: authUser.id,
    organizationId: activeOrg.orgId,
    resourceType: "offline_device",
    resourceId: criado.id,
    requestId,
    metadata: {
      nome: input.nome,
      user_id: donoDoAparelho,
      token_prefix: prefixo,
      expires_at: expiraEm,
      scopes: [...ESCOPOS_DO_DISPOSITIVO],
    },
  });

  return ok(
    {
      ...criado,
      plaintext,
      _warning:
        "Copie o código de pareamento agora. O token não é mostrado de novo — perdido, gere outro.",
    },
    { status: 201, requestId },
  );
}
