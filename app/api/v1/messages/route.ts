/**
 * POST /api/v1/messages — envia mensagem outbound (handler em ./_handler.ts).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ApiError } from "@/lib/api/types";
import { hashDaRequisicao, reservarIdempotencia } from "@/lib/api/idempotencia";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { sendMessageSchema, validateRequest, type SendMessageInput } from "@/lib/schemas";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { sendMessageHandler } from "./_handler";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const supabase = await createClient();

  // spec 13 §4: escrita é agent+ (viewer é read-only).
  const authz = await requireRole("agent", { requestId, resource: "messages" });
  if (!authz.ok) return authz.response;
  const user = authz.user;
  const activeOrg = authz.org;

  let input;
  try {
    input = await validateRequest(sendMessageSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    return fail("internal_error", "Erro interno.", 500, { requestId });
  }

  // Idempotência FORTE (mesmo desenho das rotas fiscais): a chave é
  // reivindicada ANTES do efeito. Reenviar a mesma chave com o mesmo payload
  // devolve a mensagem original com `Idempotency-Replayed`; com payload
  // diferente é 409. Sem header, o comportamento é o de sempre.
  const chave = req.headers.get("Idempotency-Key")?.trim() || null;
  let reserva: Awaited<ReturnType<typeof reservarIdempotencia>> | null = null;
  if (chave) {
    reserva = await reservarIdempotencia(createAdminClient(), {
      orgId: activeOrg.orgId,
      endpoint: "POST /api/v1/messages",
      chave,
      requestHash: hashDaRequisicao(input),
    });
    if (reserva.estado === "replay") {
      const gravado = reserva.resposta.body as { data?: unknown } | null;
      return ok(gravado?.data, {
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
        "O envio com esta chave ainda está em andamento. Tente de novo em instantes.",
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

  try {
    const message = await sendMessageHandler(
      supabase,
      {
        organization_id: activeOrg.orgId,
        actor: { type: "user", id: user.id },
        requestId,
      },
      input as SendMessageInput,
    );
    const resposta = ok(message, { status: 201, requestId });
    if (reserva?.estado === "livre") {
      await reserva.finalizar({
        status: 201,
        body: (await resposta.clone().json()) as unknown,
      });
    }
    return resposta;
  } catch (err) {
    if (reserva?.estado === "livre") await reserva.abortar();
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, { requestId });
    }
    return fail("internal_error", "Erro interno.", 500, { requestId });
  }
}
