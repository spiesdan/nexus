/**
 * GET /api/v1/fiscal-eventos — cancelamentos, cartas de correção e eventos.
 *
 * Lê `fiscal_document_events`, a tabela que a sincronização passou a alimentar
 * (antes o filtro de resumo/completa descartava `procEv`/`resEve` e o
 * cancelamento nunca chegava). O embed traz a nota quando ela já está no banco;
 * evento de nota ainda não baixada aparece com `entrada: null` em vez de sumir.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TIPOS = ["cancelamento", "carta_correcao", "manifestacao", "outro"] as const;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const COLUNAS =
  "id, entrada_id, chave, nsu, tipo, tp_evento, descricao, protocolo, dh_evento, sequencia, created_at, " +
  "fiscal_entradas(chave, numero, serie, emitente_nome, emitente_cnpj, dh_emi)";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "fiscal-eventos" });
  if (!authz.ok) return authz.response;

  const p = req.nextUrl.searchParams;
  const tipo = (p.get("tipo") ?? "").trim();
  const chave = (p.get("chave") ?? "").replace(/\D/g, "");
  const de = (p.get("de") ?? "").trim();
  const ate = (p.get("ate") ?? "").trim();
  const limite = Math.min(200, Math.max(1, Number(p.get("limite")) || 100));
  const offset = Math.max(0, Number(p.get("offset")) || 0);

  const supabase = await createClient();
  let q = supabase
    .from("fiscal_document_events")
    .select(COLUNAS, { count: "exact" })
    .eq("organization_id", authz.org.orgId);

  if (tipo !== "" && (TIPOS as readonly string[]).includes(tipo)) q = q.eq("tipo", tipo);
  if (chave !== "") q = q.eq("chave", chave);
  if (DATA.test(de)) q = q.gte("dh_evento", `${de}T00:00:00.000Z`);
  if (DATA.test(ate)) q = q.lte("dh_evento", `${ate}T23:59:59.999Z`);

  const { data, error, count } = await q
    .order("dh_evento", { ascending: false, nullsFirst: false })
    .range(offset, offset + limite - 1);

  if (error) return fail("internal_error", "Erro ao listar eventos.", 500, { requestId });
  return ok(data ?? [], {
    requestId,
    meta: { total: count ?? null, has_more: (count ?? 0) > offset + (data?.length ?? 0) },
  });
}
