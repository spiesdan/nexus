/**
 * GET /api/v1/fiscal-fornecedores — os emitentes das notas, como cadastro.
 *
 * Não é uma tabela nova: é `suppliers`, que já é o fornecedor do pedido de
 * compra. A sincronização preenche IE, endereço e os agregados (`total_notas`,
 * `total_comprado_cents`) quando a nota chega — esta rota só lê.
 *
 * `viewer` lê. Cadastrar/editar fornecedor continua sendo o caminho de compras,
 * não deste módulo.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const COLUNAS =
  "id, nome, cnpj, ie, email, telefone, endereco_json, ativo, " +
  "total_notas, total_comprado_cents, ultima_nota_em, created_at";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "fiscal-fornecedores" });
  if (!authz.ok) return authz.response;

  const p = req.nextUrl.searchParams;
  const busca = (p.get("busca") ?? "").replace(/[%,()]/g, " ").trim();
  const limite = Math.min(200, Math.max(1, Number(p.get("limite")) || 100));
  const offset = Math.max(0, Number(p.get("offset")) || 0);
  const apenasComNota = p.get("com_nota") !== "0";

  const supabase = await createClient();
  let q = supabase
    .from("suppliers")
    .select(COLUNAS, { count: "exact" })
    .eq("organization_id", authz.org.orgId);

  if (apenasComNota) q = q.gt("total_notas", 0);
  if (busca !== "") {
    const digitos = busca.replace(/\D/g, "");
    const partes = [`nome.ilike.%${busca}%`];
    if (digitos !== "") partes.push(`cnpj.ilike.%${digitos}%`);
    q = q.or(partes.join(","));
  }

  const { data, error, count } = await q
    .order("total_comprado_cents", { ascending: false })
    .order("nome", { ascending: true })
    .range(offset, offset + limite - 1);

  if (error) return fail("internal_error", "Erro ao listar fornecedores.", 500, { requestId });
  return ok(data ?? [], {
    requestId,
    meta: { total: count ?? null, has_more: (count ?? 0) > offset + (data?.length ?? 0) },
  });
}
