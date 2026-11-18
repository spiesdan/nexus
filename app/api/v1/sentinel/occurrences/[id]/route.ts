/**
 * GET/PATCH /api/v1/sentinel/occurrences/[id]
 *
 * GET: a ocorrência + histórico, para o painel de detalhe.
 * PATCH: a ÚNICA escrita humana do v1 — mudar o estado e registrar o porquê.
 * Não existe endpoint de correção automática: o Sentinel v1 observa.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { roleAtLeast } from "@/lib/auth/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { camposDaTransicao, validarTransicao, type ValidacaoTransicao } from "@/lib/sentinel/estado";
import { REGRA_POR_ID } from "@/lib/sentinel/regras";
import { ESTADOS, type EstadoOcorrencia } from "@/lib/sentinel/tipos";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const COLUNAS =
  "id, fingerprint, regra, categoria, entidade_tipo, entidade_id, titulo, resumo, " +
  "causa_provavel, severidade, estado, evidencia, href, primeira_vista_em, " +
  "ultima_vista_em, vezes_vista, recorrencias, responsavel_user_id, ignorada_motivo, " +
  "motivo_encerramento, encerrada_em, created_at, updated_at";

const mudancaSchema = z.object({
  estado: z.enum(ESTADOS),
  motivo: z.string().trim().max(500).optional(),
});

function respostaDeValidacao(v: ValidacaoTransicao, requestId: string): Response {
  const status = v.codigo === "papel_insuficiente" ? 403 : 422;
  return fail(v.codigo ?? "transicao_invalida", v.mensagem ?? "Transição inválida.", status, {
    requestId,
  });
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "sentinel" });
  if (!authz.ok) return authz.response;

  const { id } = await ctx.params;
  if (!UUID.test(id)) return fail("invalid_request", "Id inválido.", 400, { requestId });

  const supabase = (await createClient()) as unknown as SupabaseClient;

  const [{ data: ocorrencia, error: erroOcorrencia }, { data: eventos, error: erroEventos }] =
    await Promise.all([
      supabase
        .from("sentinel_occurrences")
        .select(COLUNAS)
        .eq("organization_id", authz.org.orgId)
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("sentinel_occurrence_events")
        .select(
          "id, tipo, estado_anterior, estado_novo, origem, ator_user_id, detalhe, created_at",
        )
        .eq("organization_id", authz.org.orgId)
        .eq("occurrence_id", id)
        .order("created_at", { ascending: true })
        .order("id").limit(200),
    ]);

  if (erroOcorrencia || erroEventos) {
    return fail("internal_error", "Não foi possível abrir a ocorrência.", 500, { requestId });
  }
  if (!ocorrencia) {
    return fail("not_found", "Ocorrência não encontrada.", 404, { requestId });
  }

  const regra = REGRA_POR_ID.get((ocorrencia as unknown as { regra: string }).regra);
  return ok(
    {
      ocorrencia,
      eventos: eventos ?? [],
      regra_descricao: regra?.descricao ?? null,
    },
    { requestId },
  );
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "sentinel" });
  if (!authz.ok) return authz.response;

  const { id } = await ctx.params;
  if (!UUID.test(id)) return fail("invalid_request", "Id inválido.", 400, { requestId });

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return fail("invalid_json", "Corpo inválido.", 400, { requestId });
  }

  const parsed = mudancaSchema.safeParse(corpo);
  if (!parsed.success) {
    return fail("validation_error", "Estado ou motivo inválido.", 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const supabase = (await createClient()) as unknown as SupabaseClient;
  const { data: atual, error } = await supabase
    .from("sentinel_occurrences")
    .select("id, estado, responsavel_user_id")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return fail("internal_error", "Não foi possível abrir a ocorrência.", 500, { requestId });
  }
  if (!atual) return fail("not_found", "Ocorrência não encontrada.", 404, { requestId });

  const registro = atual as {
    estado: EstadoOcorrencia;
    responsavel_user_id: string | null;
  };
  const podeGerir = authz.user.is_platform_admin || roleAtLeast(authz.org.role, "manager");

  const validacao = validarTransicao({
    de: registro.estado,
    para: parsed.data.estado,
    motivo: parsed.data.motivo,
    podeGerir,
  });
  if (!validacao.ok) return respostaDeValidacao(validacao, requestId);

  const campos = camposDaTransicao({
    de: registro.estado,
    para: parsed.data.estado,
    motivo: parsed.data.motivo,
    usuarioId: authz.user.id,
    responsavelAtual: registro.responsavel_user_id,
    agoraIso: new Date().toISOString(),
  });

  const admin = createAdminClient();
  const { data: mudanca, error: erroMudanca } = await admin.rpc("fn_sentinel_aplicar_mudanca", {
    p_organization_id: authz.org.orgId,
    p_occurrence_id: id,
    p_estado: campos.estado,
    p_ignorada_motivo: campos.ignorada_motivo,
    p_motivo_encerramento: campos.motivo_encerramento,
    p_encerrada_em: campos.encerrada_em,
    p_responsavel_user_id: campos.responsavel_user_id ?? null,
    p_ator: authz.user.id,
    p_motivo: (parsed.data.motivo ?? "").trim() || null,
  });

  if (erroMudanca) {
    return fail("internal_error", "Não foi possível mudar o estado.", 500, { requestId });
  }
  const linha = Array.isArray(mudanca) ? mudanca[0] : mudanca;
  if (!linha) return fail("not_found", "Ocorrência não encontrada.", 404, { requestId });

  await audit({
    action: "sentinel.occurrence_state",
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    resourceType: "sentinel_occurrences",
    resourceId: id,
    metadata: {
      de: registro.estado,
      para: campos.estado,
      // O motivo fica no histórico da ocorrência (sob retenção e com o ator);
      // o audit append-only guarda só a transição — texto livre do usuário não
      // entra numa tabela que não expurga.
    },
  });

  return ok({ ocorrencia_id: id, estado_anterior: registro.estado, estado: campos.estado }, {
    requestId,
  });
}
