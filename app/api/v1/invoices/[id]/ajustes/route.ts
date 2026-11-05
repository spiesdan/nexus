/**
 * GET   /api/v1/invoices/[id]/ajustes — o que a tela de correção edita.
 * PATCH /api/v1/invoices/[id]/ajustes — grava a correção (e, se pedido, reenvia).
 *
 * ─── Por que uma rota própria ───────────────────────────────────────────────
 *
 * O `PATCH /invoices/[id]` não existe, e criar um genérico convidaria a
 * editar `total_cents` ou `status` por engano. Corrigir nota é uma operação
 * com regra: só em nota que ainda não saiu, só nos campos que o XML lê, e
 * sempre com evento na timeline. O nome da rota é a regra.
 *
 * O corpo é `ajusteDaNotaSchema` (`lib/schemas/fiscal.ts`); a lógica mora em
 * `lib/fiscal/ajustes-da-nota.ts`, que é quem o drain consulta para montar o
 * payload — a tela e o emissor não podem divergir.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { ApiError } from "@/lib/api/types";
import { requireRole } from "@/lib/auth/require-role";
import { carregarQuadroDaNota, salvarAjustesDaNota } from "@/lib/fiscal/ajustes-da-nota";
import { ajusteDaNotaSchema } from "@/lib/schemas/fiscal";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "invoices" });
  if (!authz.ok) return authz.response;
  const { id } = await params;

  try {
    const supabase = await createClient();
    const quadro = await carregarQuadroDaNota(supabase, authz.org.orgId, id, requestId);
    return ok(quadro, { requestId });
  } catch (erro) {
    if (erro instanceof ApiError) {
      return fail(erro.code, erro.message, erro.status, { requestId });
    }
    return fail("internal_error", "Erro ao ler a nota.", 500, { requestId });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  // Escrever no documento fiscal é agent+ — mesmo piso da emissão e do retry.
  const authz = await requireRole("agent", { requestId, resource: "invoices" });
  if (!authz.ok) return authz.response;
  const { id } = await params;

  const corpo = await req.json().catch(() => null);
  const parsed = ajusteDaNotaSchema.safeParse(corpo);
  if (!parsed.success) {
    const primeiro = parsed.error.issues[0];
    return fail(
      "validation_failed",
      primeiro?.message ?? "Corpo inválido.",
      422,
      { requestId },
    );
  }

  try {
    const supabase = await createClient();
    const resultado = await salvarAjustesDaNota({
      supabase,
      admin: createAdminClient(),
      orgId: authz.org.orgId,
      userId: authz.user.id,
      requestId,
      invoiceId: id,
      ajuste: parsed.data,
    });
    return ok(resultado, { requestId });
  } catch (erro) {
    if (erro instanceof ApiError) {
      return fail(erro.code, erro.message, erro.status, { requestId });
    }
    return fail("internal_error", "Erro ao salvar a correção.", 500, { requestId });
  }
}
