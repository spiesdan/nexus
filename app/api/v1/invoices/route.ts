/**
 * GET  /api/v1/invoices — notas da organização ativa.
 * POST /api/v1/invoices — emite nota a partir de um pedido faturável
 * (aprovado, concluído, faturado, expedido ou entregue).
 *
 * Sem config fiscal, 422 nomeando a tela de configuração — nunca presume
 * série 1. Sem emissor real, a nota nasce `pendente` via stub (honesto):
 * o estado diz "registrada, não autorizada", e a tela diz o que falta.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ApiError } from "@/lib/api/types";
import { audit } from "@/lib/audit";
import {
  hashDaRequisicao,
  reservarIdempotencia,
} from "@/lib/api/idempotencia";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { emitirNota } from "@/lib/fiscal/emitir-nota";
import {
  COLUNAS_DA_NOTA,
  notaCreateSchema,
  pedidoPrincipalDaNota,
  STATUS_DA_NOTA,
} from "@/lib/schemas/fiscal";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "invoices" });
  if (!authz.ok) return authz.response;

  const status = req.nextUrl.searchParams.get("status")?.trim() ?? "";
  const orderId = req.nextUrl.searchParams.get("order_id")?.trim() ?? "";
  const supabase = await createClient();
  let q = supabase
    .from("invoices")
    .select(COLUNAS_DA_NOTA)
    .eq("organization_id", authz.org.orgId);

  if (status !== "" && (STATUS_DA_NOTA as readonly string[]).includes(status)) {
    q = q.eq("status", status);
  }
  if (orderId !== "") {
    q = q.eq("order_id", orderId);
  }

  const { data, error } = await q.order("created_at", { ascending: false }).limit(200);
  if (error) return fail("internal_error", "Erro ao listar as notas.", 500, { requestId });
  return ok(data ?? [], { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "invoices" });
  if (!authz.ok) return authz.response;

  const parsed = notaCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const supabase = await createClient();
  const admin = createAdminClient();

  // D-03 — idempotência FORTE: a chave é reivindicada antes da emissão. Replay
  // devolve a MESMA nota; payload diferente é 409; concorrente espera o
  // vencedor. Sem header, o comportamento é o de sempre.
  const chave = req.headers.get("Idempotency-Key")?.trim() || null;
  let reserva: Awaited<ReturnType<typeof reservarIdempotencia>> | null = null;
  if (chave) {
    reserva = await reservarIdempotencia(admin, {
      orgId: authz.org.orgId,
      endpoint: "POST /api/v1/invoices",
      chave,
      requestHash: hashDaRequisicao(parsed.data),
    });
    if (reserva.estado === "replay") {
      return ok(reserva.resposta.body, {
        requestId,
        status: 200,
        headers: { "Idempotency-Replayed": "true" },
      });
    }
    if (reserva.estado === "conflito") {
      return fail(
        "idempotency_conflict",
        "Esta Idempotency-Key já foi usada com outro payload.",
        409,
        { requestId },
      );
    }
    if (reserva.estado === "em_andamento") {
      return fail(
        "idempotency_in_progress",
        "A emissão com esta chave ainda está em andamento. Tente de novo em instantes.",
        409,
        { requestId },
      );
    }
    if (reserva.estado === "erro") {
      return fail("internal_error", "Não foi possível reservar a chave de idempotência.", 500, {
        requestId,
      });
    }
  }

  // A regra mora em `lib/fiscal/emitir-nota.ts` — a rota autentica, valida e
  // traduz, e o assistente interno chama a MESMA função na `/executar`.
  try {
    const nota = await emitirNota({
      supabase,
      admin,
      orgId: authz.org.orgId,
      userId: authz.user.id,
      requestId,
      orderId: pedidoPrincipalDaNota(parsed.data),
      orderIds: parsed.data.order_ids ?? null,
      extras: parsed.data.extras ?? null,
    });

    if (reserva?.estado === "livre") {
      await reserva.finalizar({ status: 201, body: nota });
    }

    await audit({
      organizationId: authz.org.orgId,
      actorUserId: authz.user.id,
      action: "invoice.created",
      resourceType: "invoices",
      resourceId: nota.id,
      requestId,
    });

    return ok(nota, { requestId, status: 201 });
  } catch (err) {
    if (reserva?.estado === "livre") await reserva.abortar();
    if (err instanceof ApiError) {
      return fail(
        err.code as "validation_failed" | "not_found" | "conflict" | "internal_error",
        err.message,
        err.status,
        { requestId },
      );
    }
    return fail("internal_error", "Erro interno.", 500, { requestId });
  }
}
