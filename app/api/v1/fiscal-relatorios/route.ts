/**
 * GET /api/v1/fiscal-relatorios — os números do módulo de entrada.
 *
 * `tipo` decide o recorte; `de`/`ate` (YYYY-MM-DD) filtram pela data de
 * emissão. Sem período = tudo que está gravado (a Visão Geral usa assim).
 *
 * Toda a soma é feita por `lib/fiscal/relatorios.ts` — a mesma função que os
 * testes de massa fixa exercitam. A rota não soma nada por conta própria, para
 * o relatório e a prova não poderem divergir.
 *
 * O teto de linhas existe para não derrubar o processo com um período absurdo.
 * Quando ele é atingido, a resposta diz `truncado: true` em vez de devolver um
 * total que parece completo e não é.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import {
  porFornecedor,
  porMes,
  produtosMaisComprados,
  resumoDoPeriodo,
  type LinhaDeEntrada,
  type LinhaDeItem,
} from "@/lib/fiscal/relatorios";
import { COLUNAS_DA_ENTRADA } from "@/lib/schemas/fiscal-entrada";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TIPOS = [
  "resumo",
  "fornecedores",
  "mes",
  "produtos",
  "canceladas",
  "pendentes",
] as const;
type Tipo = (typeof TIPOS)[number];

const TETO_DE_LINHAS = 20_000;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

function periodo(req: NextRequest): { de: string | null; ate: string | null } {
  const p = req.nextUrl.searchParams;
  const de = (p.get("de") ?? "").trim();
  const ate = (p.get("ate") ?? "").trim();
  return {
    de: DATA.test(de) ? de : null,
    ate: DATA.test(ate) ? ate : null,
  };
}

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "fiscal-relatorios" });
  if (!authz.ok) return authz.response;

  const tipo = ((req.nextUrl.searchParams.get("tipo") ?? "resumo").trim() || "resumo") as Tipo;
  if (!(TIPOS as readonly string[]).includes(tipo)) {
    return fail("validation_failed", `Tipo de relatório desconhecido: ${tipo}.`, 422, {
      requestId,
    });
  }
  const { de, ate } = periodo(req);

  const supabase = await createClient();
  let consulta = supabase
    .from("fiscal_entradas")
    .select(COLUNAS_DA_ENTRADA)
    .eq("organization_id", authz.org.orgId);
  if (de) consulta = consulta.gte("dh_emi", `${de}T00:00:00.000Z`);
  if (ate) consulta = consulta.lte("dh_emi", `${ate}T23:59:59.999Z`);

  const { data, error } = await consulta
    .order("dh_emi", { ascending: true, nullsFirst: false })
    .limit(TETO_DE_LINHAS);
  if (error) return fail("internal_error", "Erro ao montar o relatório.", 500, { requestId });

  const linhas = (data ?? []) as unknown as LinhaDeEntrada[];
  const truncado = linhas.length >= TETO_DE_LINHAS;

  if (tipo === "canceladas") {
    const canceladas = linhas
      .filter((l) => l.situacao_fiscal === "cancelada" || l.situacao_fiscal === "denegada")
      .map((l) => ({
        id: l.id,
        chave: l.chave,
        emitente_nome: l.emitente_nome,
        emitente_cnpj: l.emitente_cnpj,
        dh_emi: l.dh_emi,
        valor_total_cents: l.valor_total_cents,
        situacao_fiscal: l.situacao_fiscal,
      }));
    return ok({ tipo, de, ate, linhas: canceladas, truncado }, { requestId });
  }

  if (tipo === "pendentes") {
    const pendentes = linhas
      .filter((l) => l.conferencia_status !== "aprovada" && l.situacao_fiscal !== "cancelada")
      .map((l) => ({
        id: l.id,
        chave: l.chave,
        emitente_nome: l.emitente_nome,
        emitente_cnpj: l.emitente_cnpj,
        dh_emi: l.dh_emi,
        valor_total_cents: l.valor_total_cents,
        conferencia_status: l.conferencia_status,
      }));
    return ok({ tipo, de, ate, linhas: pendentes, truncado }, { requestId });
  }

  if (tipo === "produtos") {
    // Itens com o período da NOTA, não do item: um item não tem data própria.
    // `!inner` transforma o embed em junção — sem ele o filtro por `dh_emi`
    // não remove linha nenhuma e o relatório somaria fora do período.
    let itensQ = supabase
      .from("fiscal_document_items")
      .select(
        "entrada_id, codigo, descricao, ncm, unidade, quantidade, valor_total_cents, " +
          "icms_cents, ipi_cents, pis_cents, cofins_cents, " +
          "fiscal_entradas!inner(dh_emi, situacao_fiscal)",
      )
      .eq("organization_id", authz.org.orgId)
      .limit(TETO_DE_LINHAS);
    if (de) itensQ = itensQ.gte("fiscal_entradas.dh_emi", `${de}T00:00:00.000Z`);
    if (ate) itensQ = itensQ.lte("fiscal_entradas.dh_emi", `${ate}T23:59:59.999Z`);
    const { data: itensRaw, error: erroItens } = await itensQ;
    if (erroItens) {
      return fail("internal_error", "Erro ao somar os itens.", 500, { requestId });
    }
    const itens = ((itensRaw ?? []) as unknown as (LinhaDeItem & {
      fiscal_entradas: { situacao_fiscal: string } | { situacao_fiscal: string }[];
    })[]).filter((item) => {
      const e = Array.isArray(item.fiscal_entradas)
        ? item.fiscal_entradas[0]
        : item.fiscal_entradas;
      return e?.situacao_fiscal !== "cancelada" && e?.situacao_fiscal !== "denegada";
    });
    return ok(
      {
        tipo,
        de,
        ate,
        linhas: produtosMaisComprados(itens),
        truncado: itens.length >= TETO_DE_LINHAS,
      },
      { requestId },
    );
  }

  const resumo = resumoDoPeriodo(linhas);
  if (tipo === "resumo") return ok({ tipo, de, ate, resumo, truncado }, { requestId });
  if (tipo === "fornecedores") {
    return ok({ tipo, de, ate, linhas: porFornecedor(linhas), truncado }, { requestId });
  }
  return ok({ tipo, de, ate, linhas: porMes(linhas), truncado }, { requestId });
}
