/**
 * GET/PATCH /api/v1/sentinel/settings — a superfície de configuração.
 *
 * Ausência de linha = defaults (ativo, 6h, 180 dias, 500 ocorrências). O PATCH
 * cria a linha na primeira alteração. `detectores_desativados` é validado
 * contra o registry: id de regra que não existe é 422, não lixo persistido.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import {
  interpretarConfiguracao,
  LIMITE_MAXIMO,
  LIMITE_MINIMO,
} from "@/lib/sentinel/config";
import { IDS_DAS_REGRAS } from "@/lib/sentinel/regras";

export const dynamic = "force-dynamic";

const COLUNAS =
  "organization_id, ativo, intervalo_minutos, retencao_dias, limite_ocorrencias, " +
  "detectores_desativados, ultima_execucao_em, updated_by, updated_at";

const schema = z.object({
  ativo: z.boolean(),
  intervalo_minutos: z.number().int().min(15).max(10_080),
  retencao_dias: z.number().int().min(30).max(3_650),
  limite_ocorrencias: z.number().int().min(LIMITE_MINIMO).max(LIMITE_MAXIMO),
  detectores_desativados: z
    .array(z.string())
    .max(200)
    .refine((ids) => ids.every((id) => IDS_DAS_REGRAS.includes(id)), {
      message: "Regra desconhecida em detectores_desativados.",
    }),
});

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "sentinel" });
  if (!authz.ok) return authz.response;

  const supabase = (await createClient()) as unknown as SupabaseClient;
  const { data, error } = await supabase
    .from("sentinel_settings")
    .select(COLUNAS)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();

  if (error) {
    return fail("internal_error", "Não foi possível ler a configuração.", 500, { requestId });
  }

  return ok(
    {
      configuracao: interpretarConfiguracao(
        data as Parameters<typeof interpretarConfiguracao>[0],
      ),
      linha_existe: Boolean(data),
      regras_disponiveis: IDS_DAS_REGRAS,
    },
    { requestId },
  );
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "sentinel" });
  if (!authz.ok) return authz.response;

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return fail("invalid_json", "Corpo inválido.", 400, { requestId });
  }

  const parsed = schema.safeParse(corpo);
  if (!parsed.success) {
    return fail("validation_error", "Configuração inválida.", 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const supabase = (await createClient()) as unknown as SupabaseClient;
  const { data, error } = await supabase
    .from("sentinel_settings")
    .upsert(
      {
        organization_id: authz.org.orgId,
        ativo: parsed.data.ativo,
        intervalo_minutos: parsed.data.intervalo_minutos,
        retencao_dias: parsed.data.retencao_dias,
        limite_ocorrencias: parsed.data.limite_ocorrencias,
        detectores_desativados: parsed.data.detectores_desativados,
        updated_by: authz.user.id,
      },
      { onConflict: "organization_id" },
    )
    .select(COLUNAS)
    .single();

  if (error) {
    return fail("internal_error", "Não foi possível salvar a configuração.", 500, { requestId });
  }

  await audit({
    action: "sentinel.settings_changed",
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    resourceType: "sentinel_settings",
    resourceId: authz.org.orgId,
    metadata: {
      ativo: parsed.data.ativo,
      intervalo_minutos: parsed.data.intervalo_minutos,
      retencao_dias: parsed.data.retencao_dias,
      limite_ocorrencias: parsed.data.limite_ocorrencias,
      desativados: parsed.data.detectores_desativados,
    },
  });

  return ok({ configuracao: interpretarConfiguracao(data as Parameters<typeof interpretarConfiguracao>[0]) }, {
    requestId,
  });
}
