/**
 * GET /api/v1/fiscal-ibpt/consulta — imposto aproximado de um NCM/serviço (viewer+).
 *
 * Devolve as LINHAS vigentes hoje para (tipo, codigo, uf): o IBPT publica duas
 * alíquotas federais (nacional e importados) e o EX pode dar mais de uma linha
 * para o mesmo código — a tela mostra todas em vez de escolher por trás.
 *
 * `valor` (em reais, opcional) rende o imposto aproximado em centavos por
 * linha. A origem (nacional x importado) decide qual alíquota federal entra
 * na soma e NÃO está no pedido — por isso é parâmetro com default `nacional`
 * (INFERIDO: o produto nacional é o caso-base do IBPT), não regra escrita.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { impostoAproximadoCents, percentualTotal, type OrigemIbpt } from "@/lib/fiscal/ibpt";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  tipo: z.enum(["produto", "servico"]).default("produto"),
  ncm: z.string().trim().regex(/^\d{1,16}$/, "código com 1 a 16 dígitos"),
  ex: z.string().trim().max(8).optional(),
  uf: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/)
    .transform((v) => v.toUpperCase())
    .optional(),
  valor: z.coerce.number().nonnegative().max(1_000_000_000).optional(),
  origem: z.enum(["nacional", "importado"]).default("nacional"),
});

type LinhaCrua = {
  codigo: string;
  ex: string;
  descricao: string | null;
  nacional_federal: string | number;
  importados_federal: string | number;
  estadual: string | number;
  municipal: string | number;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  chave: string | null;
  versao: string | null;
  fonte: string | null;
};

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "fiscal-ibpt" });
  if (!authz.ok) return authz.response;

  const q = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) {
    return fail("validation_failed", "Parâmetros de consulta inválidos (ncm é obrigatório).", 422, { requestId });
  }
  const { tipo, ncm, ex, uf: ufQuery, valor, origem } = q.data;

  const supabase = await createClient();
  let uf = ufQuery ?? null;
  if (!uf) {
    const { data: config } = await supabase
      .from("fiscal_settings")
      .select("uf")
      .eq("organization_id", authz.org.orgId)
      .maybeSingle();
    uf = ((config as unknown as { uf?: string | null } | null)?.uf ?? "").trim().toUpperCase() || null;
  }
  if (!uf || uf.length !== 2) {
    return fail("validation_failed", "Sem UF: informe `uf` ou configure a UF na configuração fiscal.", 422, {
      requestId,
    });
  }

  const hoje = new Date().toISOString().slice(0, 10);
  let consulta = supabase
    .from("fiscal_ibpt" as never)
    .select(
      "codigo, ex, descricao, nacional_federal, importados_federal, estadual, municipal, vigencia_inicio, vigencia_fim, chave, versao, fonte",
    )
    .eq("organization_id", authz.org.orgId)
    .eq("tipo", tipo)
    .eq("codigo", ncm)
    .eq("uf", uf)
    .lte("vigencia_inicio", hoje)
    .or(`vigencia_fim.is.null,vigencia_fim.gte.${hoje}`)
    .order("vigencia_inicio", { ascending: false })
    .limit(50);
  if (ex) consulta = consulta.eq("ex", ex);

  const { data, error } = await consulta;
  if (error) return fail("internal_error", "Erro ao consultar a tabela IBPT.", 500, { requestId });

  const linhas = ((data ?? []) as unknown as LinhaCrua[]).map((l) => {
    const linha = {
      codigo: l.codigo,
      ex: l.ex,
      descricao: l.descricao,
      nacional_federal: Number(l.nacional_federal),
      importados_federal: Number(l.importados_federal),
      estadual: Number(l.estadual),
      municipal: Number(l.municipal),
      vigencia_inicio: l.vigencia_inicio,
      vigencia_fim: l.vigencia_fim,
      chave: l.chave,
      versao: l.versao,
      fonte: l.fonte,
    };
    const percentual = percentualTotal(linha, origem as OrigemIbpt);
    return {
      ...linha,
      origem,
      total_percentual: percentual,
      ...(valor !== undefined ? { imposto_aproximado_cents: impostoAproximadoCents(Math.round(valor * 100), percentual) } : {}),
    };
  });

  return ok({ uf, hoje, tipo, origem, linhas }, { requestId });
}
