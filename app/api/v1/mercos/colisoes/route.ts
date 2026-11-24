/**
 * GET /api/v1/mercos/colisoes — pedidos do Mercos que não entraram por colisão.
 *
 * A organização vem de `requireRole`, nunca do cliente. Leitura com service
 * role (a tabela é de plataforma/worker) com `organization_id` explícito.
 * Contrato consumido pela tela que o D constrói em paralelo. No mesmo payload
 * vai o resumo da ÚLTIMA reconciliação: sem `status: "completa"` e
 * `ausentes: 0` a tela NÃO pode dizer que nenhum pedido ficou de fora.
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

  const { data: corridas, error: erroResumo } = await admin
    .from("mercos_reconciliacoes_runs")
    .select(
      "run_id, atualizado_em, censo_lido, censo_esperado, ausentes, colisoes, ignorados_sem_item, status, verificado, motivos, declaracao",
    )
    .eq("organization_id", authz.org.orgId)
    .order("atualizado_em", { ascending: false })
    .limit(1);
  if (erroResumo) {
    return fail("internal_error", "Erro ao ler o resumo da reconciliação.", 500, { requestId });
  }

  const ultima = corridas?.[0];
  const resumo = ultima
    ? {
        run_id: ultima.run_id,
        quando: ultima.atualizado_em,
        censo_lido: ultima.censo_lido,
        censo_esperado: ultima.censo_esperado,
        ausentes: ultima.ausentes,
        colisoes: ultima.colisoes,
        ignorados_sem_item: ultima.ignorados_sem_item,
        status: ultima.status,
        verificado: ultima.verificado,
        motivos: ultima.motivos ?? [],
        declaracao: ultima.declaracao ?? "",
      }
    : null;

  // `resumo` é o nome original; `reconciliacao` é o que a tela do D lê.
  return ok({ itens: data ?? [], resumo, reconciliacao: resumo }, { requestId });
}
