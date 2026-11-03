/**
 * POST /api/v1/fiscal-entradas/[id]/importar — a associação vence o código.
 *
 * O defeito que este teste prende: o XML traz o código do fornecedor, que
 * normalmente não é o SKU interno. Quando a pessoa associa o item ao produto
 * certo na conferência, a importação precisa mover o estoque **desse** produto —
 * não do que por acaso tem o mesmo código. Se a associação for ignorada, o
 * estoque entra no produto errado e nasce duplicata no catálogo, em silêncio.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const ENTRADA_ID = "11111111-1111-4111-8111-111111111111";

type Registro = { data?: unknown; error?: unknown };
type Filtro = [string, unknown, unknown?];
type Chamada = { tabela: string; op: string; args: unknown[] };

let chamadas: Chamada[] = [];

/** Builder falso: a resposta depende da tabela, da operação e dos filtros. */
function fake(respostas: Record<string, (ctx: { op: string; filtros: Filtro[] }) => Registro>) {
  chamadas = [];
  return vi.fn((tabela: string) => {
    let op = "select";
    const filtros: Filtro[] = [];
    const q: Record<string, unknown> = {};
    const metodo = (nome: string) => (...args: unknown[]) => {
      filtros.push([nome, args[0], args[1]]);
      return q;
    };
    for (const nome of ["select", "eq", "in", "order", "limit", "is", "not", "or"]) {
      q[nome] = metodo(nome);
    }
    q.update = (valor: unknown) => {
      op = "update";
      chamadas.push({ tabela, op, args: [valor] });
      return q;
    };
    q.insert = (valor: unknown) => {
      op = "insert";
      chamadas.push({ tabela, op, args: [valor] });
      return q;
    };
    q.delete = () => {
      op = "delete";
      chamadas.push({ tabela, op, args: [] });
      return q;
    };
    const responder = () => respostas[tabela]?.({ op, filtros }) ?? { data: null, error: null };
    q.single = () => Promise.resolve(responder());
    q.maybeSingle = () => Promise.resolve(responder());
    q.then = (ok: unknown, err: unknown) => Promise.resolve(responder()).then(ok as never, err as never);
    return q;
  });
}

function entrada(over: Record<string, unknown> = {}) {
  return {
    id: ENTRADA_ID,
    chave: "35261012345678000199550010000012341000012345",
    numero: 10,
    serie: "1",
    emitente_nome: "Fornecedor",
    emitente_cnpj: "12345678000199",
    dh_emi: "2026-11-01",
    valor_total_cents: 1000,
    status: "manifestada",
    conferencia_status: "aprovada",
    xml: "<nfe/>",
    itens_json: [
      {
        codigo: "FORN-1",
        descricao: "Produto do fornecedor",
        quantidade: 2,
        preco_cents: 500,
        total_cents: 1000,
      },
    ],
    cobranca_json: [],
    contact_id: "contato-1",
    estoque_processado_em: null,
    financeiro_processado_em: null,
    ...over,
  };
}

function montar(over: {
  entrada?: Record<string, unknown>;
  associacao?: { produto_id: string | null };
  produtoPorId?: Record<string, unknown> | null;
  produtoPorCodigo?: Record<string, unknown> | null;
}) {
  const catalogo = over.produtoPorId ?? null;
  vi.mocked(createClient).mockResolvedValue({
    from: fake({
      fiscal_entradas: (ctx) => (ctx.op === "select" ? { data: over.entrada ?? entrada() } : { data: null }),
      fiscal_document_items: (ctx) =>
        ctx.op === "select"
          ? {
              data: [
                {
                  id: "item-1",
                  numero_item: 1,
                  produto_id: over.associacao?.produto_id ?? null,
                },
              ],
            }
          : { data: null },
      catalog_products: (ctx) => {
        if (ctx.op === "insert") return { data: { id: "prod-novo" } };
        const porId = ctx.filtros.some(([campo, coluna]) => campo === "eq" && coluna === "id")
          ? catalogo
          : null;
        // O teste diferencia as duas consultas pela coluna do `eq`.
        const porCodigo = ctx.filtros.some(([campo, coluna]) => campo === "eq" && coluna === "codigo")
          ? (over.produtoPorCodigo ?? null)
          : null;
        return { data: porCodigo ?? porId };
      },
      financial_pagaveis: () => ({ data: [] }),
    }),
  } as never);
}

async function importar() {
  const { POST } = await import("./route");
  const req = new NextRequest(`http://localhost/api/v1/fiscal-entradas/${ENTRADA_ID}/importar`, {
    method: "POST",
  });
  return POST(req, { params: Promise.resolve({ id: ENTRADA_ID }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    org: { orgId: ORG_ID },
    user: { id: "user-1" },
  } as never);
});

describe("importar — associação manual", () => {
  it("move o estoque para o produto associado, mesmo com código diferente", async () => {
    montar({
      associacao: { produto_id: "prod-certo" },
      produtoPorId: { id: "prod-certo", quantidade: 10, controla_estoque: true },
      // Se a importação casasse por código, iria para este outro produto.
      produtoPorCodigo: { id: "prod-errado", quantidade: 99, controla_estoque: true },
    });

    const res = await importar();
    expect(res.status).toBe(201);

    const atualizacoes = chamadas.filter(
      (c) => c.tabela === "catalog_products" && c.op === "update",
    );
    expect(atualizacoes).toHaveLength(1);
    expect(atualizacoes[0]!.args[0]).toMatchObject({ quantidade: 12 });

    const criacoes = chamadas.filter((c) => c.tabela === "catalog_products" && c.op === "insert");
    expect(criacoes).toHaveLength(0);
    expect(audit).toHaveBeenCalled();
  });

  it("sem associação, o casamento por código continua valendo", async () => {
    montar({
      associacao: { produto_id: null },
      produtoPorCodigo: { id: "prod-codigo", quantidade: 5, controla_estoque: true },
    });

    const res = await importar();
    expect(res.status).toBe(201);

    const atualizacoes = chamadas.filter(
      (c) => c.tabela === "catalog_products" && c.op === "update",
    );
    expect(atualizacoes).toHaveLength(1);
    expect(atualizacoes[0]!.args[0]).toMatchObject({ quantidade: 7 });
  });
});
