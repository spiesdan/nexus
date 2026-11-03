/**
 * POST /api/v1/fiscal-entradas/[id]/conferencia — aprova (ou rejeita) a nota.
 *
 * É o portão que separa "o XML chegou" de "pode mexer no estoque". A spec 21
 * (§9 e §14) proíbe movimentar estoque e criar produto sem conferência; a
 * importação passou a exigir `conferencia_status = 'aprovada'`, e esta rota é
 * quem escreve isso — com autor, data e motivo no audit.
 *
 * Gerente para cima: o mesmo piso de `importar`, porque aprovar é a decisão
 * que autoriza a importação.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const corpoSchema = z.object({
  decisao: z.enum(["aprovar", "rejeitar", "reabrir"]),
  observacoes: z.string().trim().max(2000).optional(),
});

const STATUS_POR_DECISAO = {
  aprovar: "aprovada",
  rejeitar: "rejeitada",
  reabrir: "pendente",
} as const;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "fiscal-entradas" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const supabase = await createClient();
  const { data: entrada } = await supabase
    .from("fiscal_entradas")
    .select("id, status, xml")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  const linha = entrada as unknown as { id: string; status: string; xml: string | null } | null;
  if (!linha) return fail("not_found", "Entrada não encontrada.", 404, { requestId });

  if (parsed.data.decisao === "aprovar" && !linha.xml) {
    return fail(
      "validation_failed",
      "Sem XML completo não há o que conferir — manifeste a nota e sincronize de novo.",
      422,
      { requestId },
    );
  }

  const agora = new Date().toISOString();
  const { error } = await supabase
    .from("fiscal_entradas")
    .update({
      conferencia_status: STATUS_POR_DECISAO[parsed.data.decisao],
      conferida_por: parsed.data.decisao === "reabrir" ? null : authz.user.id,
      conferida_em: parsed.data.decisao === "reabrir" ? null : agora,
      ...(parsed.data.observacoes !== undefined ? { observacoes: parsed.data.observacoes } : {}),
    })
    .eq("id", id)
    .eq("organization_id", authz.org.orgId);
  if (error) return fail("internal_error", error.message, 500, { requestId });

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: `fiscal_entrada.conferencia_${parsed.data.decisao}`,
    resourceType: "fiscal_entradas",
    resourceId: id,
    requestId,
  });

  return ok({ conferencia_status: STATUS_POR_DECISAO[parsed.data.decisao] }, { requestId });
}
