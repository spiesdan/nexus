/**
 * GET /api/v1/products/ncm-sugestao — o NCM sugerido pelo nome do produto (viewer+).
 *
 * Lê a tabela IBPT da própria organização (migração 0254) e devolve até três
 * candidatos ordenados por casamento com o nome digitado. Ninguém inventa
 * código: só sai daqui o que está no CSV oficial que o operador importou.
 *
 * Duas degradações são RESPOSTA, não erro:
 *
 *  - tabela ainda não existe (a 0254 não rodou) → `motivo: "sem_tabela_ibpt"`;
 *  - nenhum candidato passa do piso → `motivo: "sem_candidatos"`.
 *
 * Para a tela, "sem sugestão" é um estado normal: ela deixa o campo como
 * está e segue. Gravar continua sendo ato de quem salva (0216: a emissão
 * lista os produtos sem NCM em vez de presumir) — esta rota só DEVOLVE.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { candidatosDeNcm, termosParaFiltrar } from "@/lib/catalogo/sugerir-ncm";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  nome: z.string().trim().min(1, "nome vazio").max(200),
});

interface LinhaCrua {
  codigo: string;
  ex: string;
  descricao: string | null;
  vigencia_inicio: string;
  vigencia_fim: string | null;
}

type SemSugestao = { sugestao: null; candidatos: []; motivo: string };

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "catalog_products" });
  if (!authz.ok) return authz.response;

  const parsed = querySchema.safeParse({ nome: req.nextUrl.searchParams.get("nome") ?? "" });
  if (!parsed.success) {
    return fail("validation_failed", "Informe o nome do produto.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const sem = (motivo: string): Response =>
    ok({ sugestao: null, candidatos: [], motivo } satisfies SemSugestao, { requestId });

  const termos = termosParaFiltrar(parsed.data.nome);
  if (termos.length === 0) return sem("sem_termos");

  const supabase = await createClient();
  const hoje = new Date().toISOString().slice(0, 10);

  // O pré-filtro é por um dos termos mais distintivos (ILIKE, OR): sem ele a
  // query traria a tabela inteira para o `pontuar` decidir. A vigência final
  // sai em JS porque um segundo `.or()` no supabase-js sobrescreveria o
  // primeiro — `vigencia_inicio` é filtro simples e entra na query mesmo.
  const { data, error } = await supabase
    .from("fiscal_ibpt" as never)
    .select("codigo, ex, descricao, vigencia_inicio, vigencia_fim")
    .eq("organization_id", authz.org.orgId)
    .eq("tipo", "produto")
    .lte("vigencia_inicio", hoje)
    .or(termos.map((t) => `descricao.ilike.%${t}%`).join(","))
    .limit(300);

  if (error) {
    // 42P01 = relation does not exist: a 0254 não foi aplicada neste banco.
    if (error.code === "42P01") return sem("sem_tabela_ibpt");
    return fail("internal_error", "Erro ao buscar sugestão de NCM.", 500, { requestId });
  }

  const linhas = ((data ?? []) as unknown as LinhaCrua[]).filter(
    (l) => l.vigencia_inicio <= hoje && (l.vigencia_fim === null || l.vigencia_fim >= hoje),
  );
  const candidatos = candidatosDeNcm(linhas, parsed.data.nome);
  if (candidatos.length === 0) return sem("sem_candidatos");

  return ok({ sugestao: candidatos[0] ?? null, candidatos, motivo: null }, { requestId });
}
