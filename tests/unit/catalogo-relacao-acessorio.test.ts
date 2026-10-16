/**
 * A TOOL MARCA O ACESSÓRIO — e diz o que fazer com ele (cenários A, B, J).
 *
 * Nível handler (`crm_search_products`): catálogo de verdade (linhas da loja
 * de limpeza do caso real), consulta real, saída real. Sem Gemini, sem WAHA.
 */
import { describe, expect, it } from "vitest";

import { crmSearchProducts } from "@/lib/mcp/tools/comercio";

interface Linha {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  marca: string | null;
  categoria: string | null;
  preco_cents: number;
  moeda: string;
  controla_estoque: boolean;
  quantidade: number;
  destaque: boolean | null;
  preco_promocional_cents: number | null;
  promocao_ate: string | null;
}

function linha(parcial: Partial<Linha> & { nome: string; codigo: string }): Linha {
  return {
    id: parcial.codigo,
    descricao: null,
    marca: null,
    categoria: null,
    preco_cents: 1000,
    moeda: "BRL",
    controla_estoque: false,
    quantidade: 0,
    destaque: null,
    preco_promocional_cents: null,
    promocao_ate: null,
    ...parcial,
  };
}

const LOJA_LIMPEZA = [
  linha({ nome: "Vassoura de pelo", codigo: "VAS-PELO", categoria: "vassouras", preco_cents: 1500 }),
  linha({ nome: "Vassoura de nylon", codigo: "VAS-NYLON", categoria: "vassouras", preco_cents: 1200 }),
  linha({ nome: "Vassourão", codigo: "VAS-GRANDE", categoria: "vassouras", preco_cents: 2500 }),
  linha({ nome: "Cabo de vassoura avulso", codigo: "CABO-VAS", categoria: "acessórios", preco_cents: 500 }),
];

/** Dublê PostgREST mínimo: devolve as linhas, conta total, registra chamadas. */
function fakeDb(linhas: Linha[], org: string, falha = false) {
  const chamadas: Array<{ metodo: string; args: unknown[] }> = [];
  const q: Record<string, unknown> = {};
  const registra = (metodo: string) => (...args: unknown[]) => {
    chamadas.push({ metodo, args });
    return q;
  };
  for (const m of ["select", "eq", "order", "range"]) q[m] = registra(m);
  (q as { then: unknown }).then = (ok: (v: unknown) => unknown) => {
    if (falha) return Promise.resolve(ok({ data: null, error: { message: "banco fora" }, count: null }));
    return Promise.resolve(ok({ data: linhas, error: null, count: linhas.length }));
  };
  return {
    chamadas,
    ctx: { supabase: { from: () => q }, organizationId: org } as never,
  };
}

const buscar = (db: ReturnType<typeof fakeDb>, termo: string, limite = 10) =>
  crmSearchProducts.handler({ termo, limite } as never, db.ctx) as Promise<{
    produtos: Array<{ codigo: string; nome: string; preco_cents: number; relacao?: string }>;
    total_encontrados?: number;
    empate?: boolean;
    mensagem?: string;
  }>;

describe("cenário A — pergunta ampla lista os modelos, cabo por último e marcado", () => {
  it("⭐ 'Quais vassouras vocês têm?' — 3 diretas antes, cabo com relacao relacionada", async () => {
    const db = fakeDb(LOJA_LIMPEZA, "org-1");
    const r = await buscar(db, "Quais vassouras vocês têm?");

    expect(r.total_encontrados).toBe(4);
    expect(r.produtos.map((p) => p.codigo)).toEqual([
      "VAS-NYLON",
      "VAS-PELO",
      "VAS-GRANDE",
      "CABO-VAS",
    ]);
    expect(r.produtos.filter((p) => p.relacao === "relacionada").map((p) => p.codigo)).toEqual([
      "CABO-VAS",
    ]);
    // Diretas viajam SEM marcação (default) — menos token, mesma informação.
    expect(r.produtos.slice(0, 3).every((p) => p.relacao === undefined)).toBe(true);
  });
});

describe("cenário B — só o acessório existe: honestidade, não invenção", () => {
  it("⭐ catálogo só com o cabo: devolve marcado + avisa que não é o produto", async () => {
    const db = fakeDb([LOJA_LIMPEZA[3]!], "org-1");
    const r = await buscar(db, "Vocês têm vassoura?");

    expect(r.produtos).toHaveLength(1);
    expect(r.produtos[0]!.relacao).toBe("relacionada");
    expect(String(r.mensagem ?? "")).toMatch(/acessório ou alternativa/i);
    expect(String(r.mensagem ?? "")).not.toMatch(/não há nada com esse nome/i);
  });
});

describe("cenário real — combos 'PÁ + VASSOURA' não lideram como vassoura", () => {
  const LOJA_REAL = [
    linha({ nome: "PÁ COM COLETOR + VASSOURA", codigo: "149", categoria: "Vassouras", preco_cents: 5500 }),
    linha({ nome: "PÁ ROBUSTINHA + VASSOURA", codigo: "150", categoria: "Vassouras", preco_cents: 4500 }),
    linha({ nome: "Vassoura de pelo", codigo: "VAS-PELO", categoria: "Vassouras", preco_cents: 1500 }),
    linha({ nome: "Cabo de vassoura avulso", codigo: "CABO-VAS", categoria: "Vassouras", preco_cents: 500 }),
  ];

  it("⭐ 'quais vassouras vocês têm?' — combos e cabo depois, marcados", async () => {
    const db = fakeDb(LOJA_REAL, "org-1");
    const r = await buscar(db, "quais vassouras vocês têm?");

    const codigos = r.produtos.map((p) => p.codigo);
    expect(codigos[0]).toBe("VAS-PELO");
    expect(codigos.slice(1)).toEqual(expect.arrayContaining(["149", "150", "CABO-VAS"]));
    const marcadas = Object.fromEntries(r.produtos.map((p) => [p.codigo, p.relacao]));
    expect(marcadas["149"]).toBe("relacionada");
    expect(marcadas["150"]).toBe("relacionada");
    expect(marcadas["CABO-VAS"]).toBe("relacionada");
    expect(marcadas["VAS-PELO"]).toBeUndefined();
  });
});

describe("cenário D/L — pedido explícito de acessório passa limpo", () => {
  it("'Vocês têm cabo de vassoura avulso?' — cabo primeiro, sem marcação, sem aviso", async () => {
    const db = fakeDb(LOJA_LIMPEZA, "org-1");
    const r = await buscar(db, "Vocês têm cabo de vassoura avulso?");

    expect(r.produtos[0]!.codigo).toBe("CABO-VAS");
    expect(r.produtos[0]!.relacao).toBeUndefined();
    expect(String(r.mensagem ?? "")).not.toMatch(/acessório ou alternativa/i);
  });
});

describe("cenário J — banco fora não vira 'não temos'", () => {
  it("⭐ erro do Supabase vira exceção nomeada, não lista vazia honesta", async () => {
    const db = fakeDb(LOJA_LIMPEZA, "org-1", true);
    await expect(buscar(db, "vassoura")).rejects.toThrow(/buscar_produtos_falhou/);
  });
});

describe("cenário I — isolamento por organização em cada chamada", () => {
  it("o filtro organization_id viaja com o organizationId do contexto", async () => {
    const db = fakeDb(LOJA_LIMPEZA, "org-outra");
    await buscar(db, "vassoura");
    const eqs = db.chamadas.filter((c) => c.metodo === "eq");
    const org = eqs.find((c) => c.args[0] === "organization_id");
    expect(org, "busca sem filtro de organização").toBeDefined();
    expect(org!.args[1]).toBe("org-outra");
  });
});
