/**
 * O CASO DO PAPEL HIGIÊNICO — catálogo real da Bill Higiene, 2026-11-09.
 *
 * "oi, tem papel higiênico?" → a busca devolveu 8 itens de 40 e o modelo
 * respondeu 2. Três defeitos, um teste para cada:
 *
 *  1. o dispenser (que VENDE o papel) era classificado como o produto e
 *     ocupava 3 dos 8 lugares — inclusive o topo, disparando `empate: true`
 *     entre dois dispensers;
 *  2. o `limite: 8` cortava o produto 241, que tinha saldo — justamente o
 *     único que ficava de fora E estava disponível;
 *  3. a lista era uma amostra, mas o modelo não tinha como saber QUANTAS
 *     opções existiam nem em que faixas.
 *
 * Nível handler: mesmas linhas do banco de produção, mesma consulta.
 */
import { describe, expect, it } from "vitest";

import { crmSearchProducts, faixaDoProduto } from "@/lib/mcp/tools/comercio";

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
    controla_estoque: true,
    quantidade: 0,
    destaque: null,
    preco_promocional_cents: null,
    promocao_ate: null,
    ...parcial,
  };
}

/** Os 8 papéis higiênicos ativos da loja, com o estoque medido no banco. */
const PAPEIS = [
  linha({ codigo: "238", nome: "PAPEL HIGIENICO 16 ROLOS x 60MT", preco_cents: 2800, quantidade: 0 }),
  linha({ codigo: "239", nome: "PAPEL HIG 48 ROLOS X 30M FOLHA DUPLA", preco_cents: 8200, quantidade: 0 }),
  linha({ codigo: "241", nome: "PAPEL HIG FOFINHO 64 ROLOS X 60 MT", preco_cents: 11000, quantidade: 1 }),
  linha({
    codigo: "242",
    nome: "PAPEL HIG 8 ROLOS X 300MT FOLHA SIMPLES",
    preco_cents: 7200,
    quantidade: 15,
  }),
  linha({
    codigo: "243",
    nome: "PAPEL HIG 8 ROLOS X 300M 100% CELULOSE",
    preco_cents: 8200,
    quantidade: 10,
  }),
  linha({ codigo: "587", nome: "PAPEL HIG FOFINHO 24 ROLOS X 30M FOLHA DUPLA", preco_cents: 4200, quantidade: 0 }),
  linha({ codigo: "647", nome: "PAPEL HIG FOFINHO 96 ROLOS X 60 MT FOLHA SIMPLES", preco_cents: 15000, quantidade: 0 }),
  linha({ codigo: "735", nome: "PAPEL HIG FOFINHO 16 ROLOS X 60M", preco_cents: 2800, quantidade: 0 }),
];

/** Os 3 dispensers — quem VENDE o papel, não o papel. */
const DISPENSERS = [
  linha({ codigo: "8315", nome: "DISPENSER PAPEL  HIGIENICO ROLAO  PRETO PREMISSE VELOX", preco_cents: 6500, quantidade: 1 }),
  linha({ codigo: "D1", nome: "DISPENSER PAPEL HIGIENICO ROLAO BRANCO PREMISSE VELOX 300 mt", preco_cents: 6000, quantidade: 0 }),
  linha({ codigo: "D2", nome: "DISPENSER PAPEL HIGIENICO ROLAO PRETO PREMISSE VELOX 300 mt", preco_cents: 6000, quantidade: 0 }),
];

/** Papel toalha: casa "papel", não casa "higiênico". Não é o pedido. */
const TOALHAS = [
  linha({ codigo: "8259", nome: "PAPEL TOALHA ROLO AUTO-CORTE-PASSIONE CELULOSE 6X200MT 24GR", quantidade: 0 }),
  linha({ codigo: "8260", nome: "PAPEL TOALHA INTERFOLHA 2D-PASSIONE PLUS 20X20 20GR 5X1000FLS", quantidade: 0 }),
];

const CATALOGO = [...PAPEIS, ...DISPENSERS, ...TOALHAS];

function fakeDb(linhas: Linha[], org: string) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "range"]) {
    q[m] = () => q;
  }
  (q as { then: unknown }).then = (ok: (v: unknown) => unknown) =>
    Promise.resolve(ok({ data: linhas, error: null, count: linhas.length }));
  return { supabase: { from: () => q }, organizationId: org } as never;
}

const buscar = (linhas: Linha[], termo: string, limite: number) =>
  crmSearchProducts.handler({ termo, limite, somente_disponiveis: false } as never, fakeDb(linhas, "org-1")) as Promise<{
    produtos: Array<{ codigo: string; nome: string; preco_cents: number; relacao?: string }>;
    total_encontrados?: number;
    empate?: boolean;
    mensagem?: string;
    resumo?: {
      do_pedido: number;
      mostrados: number;
      parecidos: number;
      relacionados: number;
      faixas: Array<{ faixa: string; opcoes: number; com_estoque: number; preco_de: string; preco_ate: string }>;
    };
  }>;

describe("o dispenser não é o papel — e não ocupa o lugar dele", () => {
  it("⭐ 'papel higienico' com limite 8 devolve os 8 papéis, nenhum dispenser", async () => {
    const r = await buscar(CATALOGO, "papel higienico", 8);

    expect(r.produtos).toHaveLength(8);
    expect(r.produtos.every((p) => p.relacao === undefined)).toBe(true);
    expect(r.produtos.map((p) => p.codigo).sort()).toEqual(
      PAPEIS.map((p) => p.codigo).sort(),
    );
    // O 241 tinha 1 unidade e era o único cortado pelo limite antigo.
    expect(r.produtos.map((p) => p.codigo)).toContain("241");
  });

  it("⭐ o empate do topo é entre papéis, não entre dispensers", async () => {
    const r = await buscar(CATALOGO, "papel higienico", 8);
    const codigosDeDispenser = new Set(DISPENSERS.map((d) => d.codigo));

    expect(r.produtos.slice(0, 2).some((p) => codigosDeDispenser.has(p.codigo))).toBe(false);
  });

  it("quem PEDE o dispenser continua recebendo o dispenser", async () => {
    const r = await buscar(CATALOGO, "dispenser papel higienico", 8);

    expect(r.produtos.length).toBeGreaterThan(0);
    expect(r.produtos[0]!.nome.toUpperCase()).toContain("DISPENSER");
    expect(r.produtos.filter((p) => p.relacao === "relacionada")).toHaveLength(0);
  });
});

describe("a amostra diz o tamanho do catálogo", () => {
  it("⭐ resumo separa pedido (8), parecidos (2 toalhas) e acessórios (3 dispensers)", async () => {
    const r = await buscar(CATALOGO, "papel higienico", 8);

    expect(r.resumo).toBeDefined();
    expect(r.resumo!.do_pedido).toBe(8);
    expect(r.resumo!.mostrados).toBe(8);
    expect(r.resumo!.parecidos).toBe(2);
    expect(r.resumo!.relacionados).toBe(3);
  });

  it("⭐ limite 2 avisa que há 8 — e o modelo não pode apresentar 2 como catálogo", async () => {
    const r = await buscar(CATALOGO, "papel higienico", 2);

    expect(r.produtos).toHaveLength(2);
    expect(r.resumo!.do_pedido).toBe(8);
    expect(r.resumo!.mostrados).toBe(2);
    expect(String(r.mensagem ?? "")).toMatch(/há 8 opções/i);
    expect(String(r.mensagem ?? "")).toMatch(/NUNCA responda como se/i);
  });

  it("faixas agrupam por rolos, em ordem crescente, com preço e saldo", async () => {
    const r = await buscar(CATALOGO, "papel higienico", 8);
    const faixas = r.resumo!.faixas;

    expect(faixas.map((f) => f.faixa)).toEqual([
      "8 rolos",
      "16 rolos",
      "24 rolos",
      "48 rolos",
      "64 rolos",
      "96 rolos",
    ]);
    expect(faixas[0]).toMatchObject({
      opcoes: 2,
      com_estoque: 2,
      preco_de: "R$ 72,00",
      preco_ate: "R$ 82,00",
    });
    expect(faixas[4]).toMatchObject({ opcoes: 1, com_estoque: 1, preco_de: "R$ 110,00" });
  });

  it("sem corte, o resumo não vira aviso de amostra", async () => {
    const r = await buscar(PAPEIS.slice(0, 3), "papel higienico", 8);

    expect(r.produtos).toHaveLength(3);
    expect(r.resumo!.do_pedido).toBe(3);
    expect(r.resumo!.mostrados).toBe(3);
    expect(String(r.mensagem ?? "")).not.toMatch(/há \d+ opções/i);
  });

  it("uma opção só não gera resumo — não há o que resumir", async () => {
    const r = await buscar([PAPEIS[4]!], "papel higienico", 8);

    expect(r.produtos).toHaveLength(1);
    expect(r.resumo).toBeUndefined();
  });
});

describe("faixaDoProduto — o recorte que o cliente entende", () => {
  it("rolos vêm antes de metragem", () => {
    expect(faixaDoProduto("PAPEL HIGIENICO 16 ROLOS x 60MT")).toBe("16 rolos");
    expect(faixaDoProduto("PAPEL HIG 8 ROLOS X 300MT FOLHA SIMPLES")).toBe("8 rolos");
  });

  it("sem rolos, a metragem é a faixa", () => {
    expect(faixaDoProduto("BOBINA 300 MT BRANCA")).toBe("300 m");
  });

  it("sem medida, cai em 'outras opções'", () => {
    expect(faixaDoProduto("SABONETE LIQUIDO NEUTRO")).toBe("outras opções");
  });
});
