/**
 * POST /api/v1/shipments/[id]/rota/confirmar — o motorista aplicou a versão.
 *
 * A tela do aparelho guardava `versaoVista` só no navegador: o escritório não
 * tinha como saber se a nova sequência chegou ao motorista. Este aceite grava
 * a versão confirmada com CAS — se o painel subiu a versão enquanto o motorista
 * decidia, recusa 409 em vez de confirmar uma rota que já não existe.
 *
 * `organization_id` vem do JWT (requireRole), nunca do corpo.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const corpoSchema = z.object({ versao: z.number().int().min(1).max(32000) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "shipments_rota_confirmar" });
  if (!authz.ok) return authz.response;

  const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Versão inválida.", 422, { requestId });
  }
  const { id } = await params;
  const agora = new Date().toISOString();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("shipments")
    .update({
      rota_versao_confirmada: parsed.data.versao,
      rota_confirmada_em: agora,
      updated_at: agora,
    })
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .eq("rota_versao", parsed.data.versao)
    .in("status", ["montando", "em_rota"])
    .select("id, rota_versao, rota_versao_confirmada, rota_confirmada_em")
    .maybeSingle();

  if (error) return fail("internal_error", "Erro ao confirmar a rota.", 500, { requestId });
  if (!data) {
    return fail("state_conflict", "Essa versão não é mais a atual.", 409, { requestId });
  }
  return ok(data, { requestId });
}
