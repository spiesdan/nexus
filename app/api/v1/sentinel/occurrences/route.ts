/**
 * GET /api/v1/sentinel/occurrences — a lista que o painel lê.
 *
 * Leitura `viewer+`, sempre com `organization_id` da org ativa. A RLS também
 * filtra, mas o filtro explícito é a regra da casa para toda query de rota:
 * duas camadas, nenhuma delas opcional.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { CATEGORIAS, ESTADOS, SEVERIDADES } from "@/lib/sentinel/tipos";

export const dynamic = "force-dynamic";

const COLUNAS =
  "id, fingerprint, regra, categoria, entidade_tipo, entidade_id, titulo, resumo, " +
  "causa_provavel, severidade, estado, evidencia, href, primeira_vista_em, " +
  "ultima_vista_em, vezes_vista, recorrencias, responsavel_user_id, ignorada_motivo, " +
  "motivo_encerramento, encerrada_em, created_at, updated_at";

function listaValida<T extends string>(
  bruto: string | null,
  permitidos: readonly T[],
): T[] {
  if (!bruto) return [];
  const set = new Set<string>(permitidos);
  return bruto
    .split(",")
    .map((x) => x.trim())
    .filter((x): x is T => set.has(x));
}

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "sentinel" });
  if (!authz.ok) return authz.response;

  const p = req.nextUrl.searchParams;
  const estados = listaValida(p.get("estado"), ESTADOS);
  const categorias = listaValida(p.get("categoria"), CATEGORIAS);
  const severidades = listaValida(p.get("severidade"), SEVERIDADES);
  const regra = (p.get("regra") ?? "").trim();
  const busca = (p.get("q") ?? "").trim();
  const incluirFechadas = p.get("fechadas") === "1";
  const limite = Math.min(200, Math.max(1, Number(p.get("limite")) || 100));
  const offset = Math.max(0, Number(p.get("offset")) || 0);

  const supabase = (await createClient()) as unknown as SupabaseClient;
  let q = supabase
    .from("sentinel_occurrences")
    .select(COLUNAS, { count: "exact" })
    .eq("organization_id", authz.org.orgId);

  if (estados.length > 0) q = q.in("estado", estados);
  else if (!incluirFechadas) q = q.in("estado", ["nova", "investigando", "acao_necessaria", "aprovada", "recorrente"]);

  if (categorias.length > 0) q = q.in("categoria", categorias);
  if (severidades.length > 0) q = q.in("severidade", severidades);
  if (regra !== "") q = q.eq("regra", regra);
  if (busca !== "") q = q.ilike("titulo", `%${busca}%`);

  const { data, error, count } = await q
    .order("ultima_vista_em", { ascending: false })
    .range(offset, offset + limite - 1);

  if (error) {
    return fail("internal_error", "Não foi possível listar as ocorrências.", 500, { requestId });
  }

  return ok(data ?? [], {
    requestId,
    meta: {
      total: count ?? null,
      has_more: (count ?? 0) > offset + (data?.length ?? 0),
      limite,
      offset,
    },
  });
}
