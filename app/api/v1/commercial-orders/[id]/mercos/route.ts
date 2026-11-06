/**
 * POST /api/v1/commercial-orders/[id]/mercos — "Atualizar do Mercos".
 *
 * Enfileira uma execução de revisão mirando UM número. O navegador do Mercos
 * não roda aqui (credencial e Chromium vivem no worker `mercos`), então a rota
 * responde em milissegundos com a execução; a tela acompanha pelo GET de
 * `importar-mercos?id=...`.
 *
 * Por que só pedido `origem = 'mercos'`: número é a identidade dentro da
 * organização, e pedido local pode ter o mesmo número (o caso dos 18538..18558
 * de demonstração). Revisar um pedido local traria dados do ERP por cima de
 * um pedido que nunca veio de lá.
 *
 * A regra do que o Mercos pode mudar está em `fn_sincronizar_pedido_mercos`
 * (migration 0297): cliente, endereço de entrega e itens/totais. Status,
 * vendedor, carga e ajuste fiscal não são tocados; nota emitida bloqueia.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { enfileirarImportacaoMercos } from "@/lib/mercos/importacao";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "commercial_orders" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const supabase = await createClient();
  const { data: pedido } = await supabase
    .from("commercial_orders")
    .select("id, numero, origem, status")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();

  const p = pedido as unknown as {
    id: string;
    numero: number;
    origem: string;
    status: string;
  } | null;
  if (!p) return fail("not_found", "Pedido não encontrado.", 404, { requestId });

  if (p.origem !== "mercos") {
    return fail(
      "validation_failed",
      "Este pedido não veio do Mercos — não há o que atualizar do ERP.",
      422,
      { requestId },
    );
  }

  if (p.status === "entregue" || p.status === "cancelado") {
    return fail(
      "validation_failed",
      `Pedido ${p.status} não aceita atualização do Mercos.`,
      422,
      { requestId },
    );
  }

  try {
    const resultado = await enfileirarImportacaoMercos(createAdminClient(), {
      organizationId: authz.org.orgId,
      requestedBy: authz.user.id,
      origem: "manual",
      revisarNumeros: [p.numero],
    });

    void audit({
      action: "commercial_orders.mercos_import.enqueue",
      actorUserId: authz.user.id,
      organizationId: authz.org.orgId,
      resourceType: "commercial_order",
      resourceId: p.id,
      requestId,
      metadata: {
        numero: p.numero,
        revisao: true,
        ja_estava_rodando: resultado.jaEstavaRodando,
        execucao: resultado.execucao.id,
      },
    });

    return ok(resultado, { requestId });
  } catch (err) {
    return fail("internal_error", err instanceof Error ? err.message : String(err), 500, {
      requestId,
    });
  }
}
