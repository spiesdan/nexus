/**
 * GET /api/v1/comercial/inativos — clientes que compravam e pararam.
 *
 * `?dias=60`: sem compra há ao menos N dias. Só quem JÁ comprou (cancelado
 * não conta como compra); ordenado por score de recuperação.
 *
 * A consulta mora em `lib/comercial/inativos.ts` porque a prévia da campanha de
 * recuperação faz a MESMA pergunta. Duas cópias divergiriam no primeiro filtro
 * novo (opt-out, contato mesclado) e uma delas mandaria para quem pediu STOP.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";
import { listarInativos } from "@/lib/comercial/inativos";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "commercial_orders" });
  if (!authz.ok) return authz.response;

  const dias = Math.min(
    3650,
    Math.max(1, Number(req.nextUrl.searchParams.get("dias") ?? 60) || 60),
  );

  const supabase = await createClient();
  try {
    const resultado = await listarInativos(supabase, {
      organizationId: authz.org.orgId,
      dias,
    });
    return ok(resultado.lista, { requestId });
  } catch (e) {
    logger.error("[comercial.inativos] falha ao listar inativos", {
      requestId,
      organization_id: authz.org.orgId,
      erro: e instanceof Error ? e.message : String(e),
    });
    return fail("internal_error", "Erro ao listar os clientes inativos.", 500, { requestId });
  }
}
