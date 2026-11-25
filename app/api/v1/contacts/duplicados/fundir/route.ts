/**
 * POST /api/v1/contacts/duplicados/fundir — a fusão que o humano confirmou.
 *
 * Nada aqui decide sozinho: recebe vencedor + perdedores + motivo, e chama
 * `fn_fundir_contatos` (0355), que reponta todas as tabelas com `contact_id`
 * descobertas no catálogo, funde conversas duplicadas do mesmo canal/sessão
 * sem perder mensagem e marca `is_merged_into` nos perdedores.
 *
 * ─── Por que manager ───────────────────────────────────────────────────────
 *
 * Pedido repontado NÃO volta sozinho (`is_merged_into` é reversível, o vínculo
 * do pedido não). É a mesma classe de decisão irreversível que a correção do
 * Sentinel e o fechamento de carga, que o repo já guarda com manager. A tabela
 * de descarte também escreve por manager — as duas ações da mesma tela têm o
 * mesmo dono.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ApiError } from "@/lib/api/types";
import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import type { ResultadoFusao } from "@/lib/contacts/duplicados";
import { validateRequest } from "@/lib/schemas";
import { createAdminClient } from "@/lib/supabase/admin";

import { comMetricas } from "@/lib/observabilidade/rotas";

export const dynamic = "force-dynamic";

const fundirSchema = z.object({
  vencedor_id: z.string().uuid(),
  perdedores_ids: z.array(z.string().uuid()).min(1).max(50),
  motivo: z.string().trim().min(3).max(500),
});

const RECUSAS_DE_NEGOCIO =
  /nao pertence|ja esta mesclado|nao pode estar entre|informe ao menos|perdedores repetidos|perdedor nulo/;

async function post(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "contacts" });
  if (!authz.ok) return authz.response;

  let input: z.infer<typeof fundirSchema>;
  try {
    input = await validateRequest(fundirSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    return fail("internal_error", "Erro interno.", 500, { requestId });
  }

  if (input.perdedores_ids.includes(input.vencedor_id)) {
    return fail(
      "validation_failed",
      "O vencedor não pode estar na lista de perdedores.",
      422,
      { requestId },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("fn_fundir_contatos", {
    p_org: authz.org.orgId,
    p_vencedor: input.vencedor_id,
    p_perdedores: input.perdedores_ids,
  });

  if (error) {
    // Recusa de negócio da função (ficha de outra org, já mesclada, lista
    // vazia): erro do usuário, não do servidor. O texto é genérico para não
    // confirmar a existência de ficha de outro tenant.
    if (RECUSAS_DE_NEGOCIO.test(error.message)) {
      return fail("validation_failed", "A fusão não foi aceita para estas fichas.", 422, {
        requestId,
      });
    }
    return fail("internal_error", "Erro ao fundir os clientes.", 500, { requestId });
  }

  const resultado = data as ResultadoFusao;

  // Auditoria no MESMO commit da resposta: a fusão é irreversível nos vínculos
  // (pedido repontado não volta), então os ids e as contagens são a trilha que
  // permite reconstruir o que aconteceu.
  await audit({
    action: "contact.merged",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "contacts",
    resourceId: input.vencedor_id,
    requestId,
    metadata: {
      motivo: input.motivo,
      vencedor_id: input.vencedor_id,
      perdedores_ids: input.perdedores_ids,
      contatos_mesclados: resultado.contatos_mesclados,
      conversas_fundidas: resultado.conversas_fundidas ?? 0,
      repontados: resultado.repontados,
      conflitos: resultado.conflitos,
    },
  });

  return ok(resultado, { requestId });
}

export const POST = comMetricas("/api/v1/contacts/duplicados/fundir", post);
