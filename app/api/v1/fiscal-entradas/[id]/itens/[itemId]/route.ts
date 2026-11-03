/**
 * PATCH /api/v1/fiscal-entradas/[id]/itens/[itemId] — associa (ou desassocia)
 * o item da nota a um produto do catálogo.
 *
 * ─── Por que esta rota existe ────────────────────────────────────────────────
 *
 * O XML traz o **código do fornecedor**, que quase nunca é o SKU interno. A
 * importação casa por código e, quando não acha, cria um produto novo — decisão
 * automática que a spec 21 (§14) só permite depois da conferência. Quem confere
 * precisa poder dizer "este item é aquele produto" **antes** de importar, para
 * não nascer duplicata no catálogo por causa de um código diferente.
 *
 * ─── Por que `manager` ───────────────────────────────────────────────────────
 *
 * A associação decide para qual produto o estoque vai e qual custo é
 * atualizado. É a mesma consequência de `importar`, então o mesmo piso.
 *
 * ─── Por que `null` é permitido ──────────────────────────────────────────────
 *
 * Desfazer uma associação errada tem de ser possível sem editar banco. `null`
 * limpa `produto_id` e o rastro de quem associou; a importação volta a casar
 * pelo código.
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
  produto_id: z.string().uuid().nullable(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "fiscal-entradas" });
  if (!authz.ok) return authz.response;

  const { id, itemId } = await params;
  const idsValidos =
    z.string().uuid().safeParse(id).success && z.string().uuid().safeParse(itemId).success;
  if (!idsValidos) {
    return fail("validation_failed", "id ou item inválido.", 400, { requestId });
  }

  const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Informe produto_id (UUID) ou null para desassociar.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }
  const produtoId = parsed.data.produto_id;

  const supabase = await createClient();

  // O item tem de pertencer à nota E à organização. Ler a nota pelo id já
  // resolve os dois: não existe item de outra org alcançável por este path.
  const { data: itemRaw } = await supabase
    .from("fiscal_document_items")
    .select("id, numero_item, codigo, produto_id")
    .eq("organization_id", authz.org.orgId)
    .eq("entrada_id", id)
    .eq("id", itemId)
    .maybeSingle();
  if (!itemRaw) return fail("not_found", "Item da nota não encontrado.", 404, { requestId });

  if (produtoId !== null) {
    const { data: produto } = await supabase
      .from("catalog_products")
      .select("id")
      .eq("organization_id", authz.org.orgId)
      .eq("id", produtoId)
      .maybeSingle();
    if (!produto) {
      return fail("not_found", "Produto do catálogo não encontrado.", 404, { requestId });
    }
  }

  const agora = new Date().toISOString();
  const { error } = await supabase
    .from("fiscal_document_items")
    .update({
      produto_id: produtoId,
      associado_por: produtoId === null ? null : authz.user.id,
      associado_em: produtoId === null ? null : agora,
    })
    .eq("organization_id", authz.org.orgId)
    .eq("entrada_id", id)
    .eq("id", itemId);
  if (error) return fail("internal_error", "Não consegui salvar a associação.", 500, { requestId });

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: produtoId === null ? "fiscal_entrada.item_desassociado" : "fiscal_entrada.item_associado",
    resourceType: "fiscal_document_items",
    resourceId: itemId,
    requestId,
    metadata: {
      entrada_id: id,
      numero_item: (itemRaw as unknown as { numero_item: number }).numero_item,
      produto_id: produtoId,
    },
  });

  return ok({ item_id: itemId, produto_id: produtoId }, { requestId });
}
