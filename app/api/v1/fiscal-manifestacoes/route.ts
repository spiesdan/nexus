/**
 * GET /api/v1/fiscal-manifestacoes — o histórico de manifestações.
 *
 * Uma linha por TENTATIVA (sucesso ou erro), com protocolo, cStat, autor e
 * data. `fiscal_entradas.manifestacao` guarda só o último estado, para a lista
 * não fazer join — este é o rastro completo que a spec pede.
 *
 * A leitura é `viewer`; quem transmite é a rota `[id]/manifestar`, com
 * `agent` para ciência e `manager` para os outros três eventos.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const COLUNAS =
  "id, entrada_id, evento, justificativa, protocolo, cstat, resultado, mensagem, usuario_id, created_at, " +
  "fiscal_entradas(chave, numero, serie, emitente_nome, emitente_cnpj, dh_emi)";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "fiscal-manifestacoes" });
  if (!authz.ok) return authz.response;

  const p = req.nextUrl.searchParams;
  const evento = (p.get("evento") ?? "").trim();
  const resultado = (p.get("resultado") ?? "").trim();
  const entrada = (p.get("entrada") ?? "").trim();
  const limite = Math.min(200, Math.max(1, Number(p.get("limite")) || 100));
  const offset = Math.max(0, Number(p.get("offset")) || 0);

  const supabase = await createClient();
  let q = supabase
    .from("fiscal_manifestations")
    .select(COLUNAS, { count: "exact" })
    .eq("organization_id", authz.org.orgId);

  if (["ciencia", "confirmacao", "desconhecimento", "nao_realizada"].includes(evento)) {
    q = q.eq("evento", evento);
  }
  if (resultado === "sucesso" || resultado === "erro") q = q.eq("resultado", resultado);
  if (entrada !== "") q = q.eq("entrada_id", entrada);

  const { data, error, count } = await q
    .order("created_at", { ascending: false })
    .range(offset, offset + limite - 1);

  if (error) return fail("internal_error", "Erro ao listar manifestações.", 500, { requestId });
  return ok(data ?? [], {
    requestId,
    meta: { total: count ?? null, has_more: (count ?? 0) > offset + (data?.length ?? 0) },
  });
}
