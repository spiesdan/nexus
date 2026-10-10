/**
 * PATCH /api/v1/alertas/[id] — resolver ou devolver um alerta.
 *
 * ─── Por que "resolver" é um ato e não um efeito colateral ───────────────────
 *
 * A rotina reconcilia por estado: se o evento deixou de valer, o alerta vira
 * `resolvido` sozinho. Este PATCH é o outro caso — o evento CONTINUA valendo e a
 * pessoa resolveu mesmo assim. Isso acontece: o cliente foi atendido por telefone
 * e o pedido de nota ficou resolvido fora do sistema.
 *
 * Sem este caminho, a pessoa só teria duas saídas: esperar a rotina concordar com
 * ela (o que ela não pode acelerar), ou ficar olhando um aviso que ela já
 * tratou. E um aviso que ninguém pode fechar é um aviso que ninguém lê.
 *
 * ─── `cancelado` e `resolvido` são diferentes, e por quê ─────────────────────
 *
 * `resolvido` = alguém tratou. `cancelado` = o evento nunca foi um problema (a
 * cidade em comum era coincidência, o pedido já estava em outra carga). A
 * diferença aparece no histórico, e é ela que permite responder "por que isso
 * estava me incomodando?" meses depois.
 *
 * ─── Idempotência ────────────────────────────────────────────────────────────
 *
 * Resolver duas vezes não muda nada e devolve o mesmo estado. Um `status = 'aberto'`
 * no WHERE garante que o segundo PATCH não sobrescreve o `resolvido_por` de quem
 * resolveu primeiro.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { audit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  status: z.enum(["aberto", "resolvido", "cancelado"]),
  motivo: z.string().trim().max(500).nullable().optional(),
});

const COLUNAS =
  "id, chave, origem_tipo, origem_id, titulo, descricao, acao_recomendada, " +
  "href, prioridade, status, motivo_resolucao, resolvido_em, updated_at";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();

  // `viewer` no GET e `agent` aqui: ver um aviso é de qualquer um da equipe;
  // fechar um é ato de quem trabalha a fila. Um `viewer` que resolve alerta sai
  // da lista sem ninguém perceber que o problema continua lá.
  const authz = await requireRole("agent", { requestId, resource: "operational_alerts" });
  if (!authz.ok) return authz.response;

  const { id } = await params;

  let corpo: z.infer<typeof bodySchema>;
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return fail("validation_failed", "Dados inválidos.", 422, {
        requestId,
        details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
      });
    }
    corpo = parsed.data;
  } catch {
    return fail("validation_failed", "Corpo da requisição não é JSON.", 400, { requestId });
  }

  const supabase = await createClient();

  // O `.eq("status", "aberto")` no WHERE é a idempotência: um segundo PATCH não
  // casa em nada e devolve 404 — que é a resposta honesta para "isso já estava
  // resolvido por outra pessoa".
  const { data, error } = await supabase
    .from("operational_alerts")
    .update({
      status: corpo.status,
      resolvido_em: corpo.status === "aberto" ? null : new Date().toISOString(),
      resolvido_por: corpo.status === "aberto" ? null : authz.user.id,
      motivo_resolucao: corpo.motivo ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .eq("status", "aberto")
    .select(COLUNAS)
    .maybeSingle();

  if (error) {
    return fail("internal_error", "Erro ao atualizar o alerta.", 500, { requestId });
  }
  if (!data) {
    return fail("not_found", "Alerta não encontrado ou já tratado.", 404, { requestId });
  }

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "operational_alert.updated",
    resourceType: "operational_alerts",
    resourceId: id,
    requestId,
    metadata: { status: corpo.status, origem: (data as unknown as { origem_tipo: string }).origem_tipo },
  });

  return ok(data, { requestId });
}
