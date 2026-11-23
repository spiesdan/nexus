/**
 * GET /api/v1/mercos/colisoes — pedidos do Mercos que não entraram por colisão.
 *
 * A organização vem de `requireRole`, nunca do cliente. Leitura com service
 * role (a tabela é de plataforma/worker) com `organization_id` explícito.
 * Contrato consumido pela tela que o D constrói em paralelo.
 */
import { randomUUID } from "node:crypto";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "mercos_colisoes" });
  if (!authz.ok) return authz.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("mercos_colisoes")
    .select(
      "numero_mercos, cliente_mercos_nome, cliente_local_nome, valor_cents, visto_em, resolvido_em, pedido_importado_id",
    )
    .eq("organization_id", authz.org.orgId)
    .order("visto_em", { ascending: false })
    .limit(500);

  if (error) return fail("internal_error", "Erro ao ler colisões do Mercos.", 500, { requestId });
  return ok({ itens: data ?? [] }, { requestId });
}
