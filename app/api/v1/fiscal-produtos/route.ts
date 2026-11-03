/**
 * GET /api/v1/fiscal-produtos — os itens das notas, um por linha.
 *
 * É a lista operacional ("o que veio em cada nota"), não o agregado. O
 * agregado (produtos mais comprados) é relatório e vive em
 * `/api/v1/fiscal-relatorios?tipo=produtos`, com período — somar tudo sem
 * recorte é o tipo de número que ninguém consegue conferir.
 *
 * O embed `fiscal_entradas!inner` traz a nota e permite filtrar por período e
 * por emitente; `!inner` porque um item sem nota não existe e não deve entrar
 * na lista.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const COLUNAS =
  "id, entrada_id, numero_item, codigo, ean, descricao, ncm, cfop, unidade, quantidade, " +
  "valor_unitario_cents, valor_total_cents, icms_cents, ipi_cents, pis_cents, cofins_cents, " +
  "cst, produto_id, fiscal_entradas!inner(chave, numero, serie, emitente_nome, emitente_cnpj, dh_emi, situacao_fiscal)";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "fiscal-produtos" });
  if (!authz.ok) return authz.response;

  const p = req.nextUrl.searchParams;
  const busca = (p.get("busca") ?? "").replace(/[%,()]/g, " ").trim();
  const ncm = (p.get("ncm") ?? "").replace(/\D/g, "").slice(0, 8);
  const entrada = (p.get("entrada") ?? "").trim();
  const de = (p.get("de") ?? "").trim();
  const ate = (p.get("ate") ?? "").trim();
  const limite = Math.min(200, Math.max(1, Number(p.get("limite")) || 100));
  const offset = Math.max(0, Number(p.get("offset")) || 0);

  const supabase = await createClient();
  let q = supabase
    .from("fiscal_document_items")
    .select(COLUNAS, { count: "exact" })
    .eq("organization_id", authz.org.orgId);

  if (entrada !== "") q = q.eq("entrada_id", entrada);
  if (ncm !== "") q = q.eq("ncm", ncm);
  if (DATA.test(de)) q = q.gte("fiscal_entradas.dh_emi", `${de}T00:00:00.000Z`);
  if (DATA.test(ate)) q = q.lte("fiscal_entradas.dh_emi", `${ate}T23:59:59.999Z`);
  if (busca !== "") {
    q = q.or(`codigo.ilike.%${busca}%,descricao.ilike.%${busca}%,ean.ilike.%${busca}%`);
  }

  const { data, error, count } = await q
    .order("created_at", { ascending: false })
    .range(offset, offset + limite - 1);

  if (error) return fail("internal_error", "Erro ao listar os itens.", 500, { requestId });
  return ok(data ?? [], {
    requestId,
    meta: { total: count ?? null, has_more: (count ?? 0) > offset + (data?.length ?? 0) },
  });
}
