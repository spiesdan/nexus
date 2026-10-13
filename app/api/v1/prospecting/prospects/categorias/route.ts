/**
 * GET /api/v1/prospecting/prospects/categorias — as categorias que EXISTEM.
 *
 * ─── Por que existe ───────────────────────────────────────────────────────
 *
 * A tela de Empresas filtra por categoria, e o campo vem da API do Google: o
 * vocabulário real é do terreno ("Auto repair shop", "Car wash", "Building
 * materials store"), não as 83 subcategorias do Radar — que são os TERMOS DE
 * BUSCA, em português. Um seletor com as 83 devolveria lista vazia para quase
 * tudo, e o operador não teria como descobrir o nome certo.
 *
 * Traz o texto exato que está gravado, com a contagem. Sem a contagem, o
 * seletor é uma lista de 900 itens indistinguíveis e não ajuda a escolher.
 *
 * A ordem é por contagem, não alfabética: o que o negócio mais prospecta vem
 * primeiro, e é o que a pessoa procura 90% das vezes.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Acima disto o seletor vira ruído — ninguém rola 900 itens para achar um. */
const LIMITE = 300;

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "business_prospects" });
  if (!authz.ok) return authz.response;

  const termo = req.nextUrl.searchParams.get("busca")?.trim() ?? "";

  const admin = createAdminClient();
  let q = admin
    .from("business_prospects")
    .select("categoria")
    .eq("organization_id", authz.org.orgId)
    .eq("bloqueado", false)
    .not("categoria", "is", null);
  if (termo) q = q.ilike("categoria", `%${termo}%`);

  const { data, error } = await q.limit(20_000);
  if (error) return fail("internal_error", "Erro ao ler as categorias.", 500, { requestId });

  // A contagem sai aqui em vez de um group-by no PostgREST: ele não devolve
  // agregado por campo sem view, e trazer 20k linhas é barato contra a
  // complexidade de uma view nova.
  const contagem = new Map<string, number>();
  for (const linha of data ?? []) {
    const c = String((linha as { categoria?: string | null }).categoria ?? "").trim();
    if (c === "") continue;
    contagem.set(c, (contagem.get(c) ?? 0) + 1);
  }

  const categorias = [...contagem.entries()]
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"))
    .slice(0, LIMITE);

  return ok({ categorias, total_distintas: contagem.size, truncado: contagem.size > LIMITE }, { requestId });
}