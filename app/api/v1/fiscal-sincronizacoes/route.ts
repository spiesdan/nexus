/**
 * GET /api/v1/fiscal-sincronizacoes — o histórico de sincronizações.
 *
 * Uma linha por execução, inclusive as que falharam. É a prova visível de que
 * o cursor não andou sem persistência: `nsu_inicial`/`nsu_final` e
 * `docs_importados`/`docs_erro` dizem exatamente até onde foi e onde parou.
 *
 * `viewer` lê. Quem dispara é o botão (agent) e o cron (secret).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const COLUNAS =
  "id, origem, iniciado_em, finalizado_em, nsu_inicial, nsu_final, max_nsu, " +
  "docs_encontrados, docs_importados, docs_erro, resultado, cstat, mensagem, " +
  "request_id, usuario_id, created_at";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "fiscal-sincronizacoes" });
  if (!authz.ok) return authz.response;

  const p = req.nextUrl.searchParams;
  const origem = (p.get("origem") ?? "").trim();
  const resultado = (p.get("resultado") ?? "").trim();
  const limite = Math.min(200, Math.max(1, Number(p.get("limite")) || 100));
  const offset = Math.max(0, Number(p.get("offset")) || 0);

  const supabase = await createClient();
  let q = supabase
    .from("fiscal_sync_logs")
    .select(COLUNAS, { count: "exact" })
    .eq("organization_id", authz.org.orgId);

  if (origem === "manual" || origem === "cron") q = q.eq("origem", origem);
  if (["em_andamento", "sucesso", "vazio", "erro", "bloqueado"].includes(resultado)) {
    q = q.eq("resultado", resultado);
  }

  const { data, error, count } = await q
    .order("iniciado_em", { ascending: false })
    .range(offset, offset + limite - 1);

  if (error) return fail("internal_error", "Erro ao listar sincronizações.", 500, { requestId });
  return ok(data ?? [], {
    requestId,
    meta: { total: count ?? null, has_more: (count ?? 0) > offset + (data?.length ?? 0) },
  });
}
