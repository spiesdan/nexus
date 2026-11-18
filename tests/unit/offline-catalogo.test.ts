/**
 * O CATÁLOGO NO BOLSO — a regra que a fase 7 não tinha teste.
 *
 * O módulo existia sem nenhum caso: `lib/offline/catalogo.ts` era o único
 * caminho que decide o que o vendedor tem no aparelho quando está sem sinal, e
 * ninguém exercitava nem a troca atômica nem a paginação de contatos.
 *
 * As propriedades que importam (e que errar recria um defeito):
 *
 *   1. TROCA, não mescla: `DELETE` antes de cada `INSERT` — produto desativado
 *      no servidor não pode continuar vendável no aparelho;
 *   2. falha de download NÃO apaga o catálogo antigo: os três downloads
 *      acontecem antes do primeiro `DELETE`, então um 500 deixa o vendedor com
 *      o que já tinha;
 *   3. contatos paginam por `meta.cursor` e param no teto de 20 páginas;
 *   4. o carimbo usa o relógio injetado (a tela mostra "catálogo de N dias").
 */
import { describe, expect, it } from "vitest";

import {
  carimboDoCatalogo,
  sincronizarCatalogo,
  sincronizarCatalogoDoDispositivo,
  type ContatoEmCache,
  type ProdutoEmCache,
} from "@/lib/offline/catalogo";
import type { Db } from "@/lib/offline/outbox";

function dbFake() {
  const chamadas: { sql: string; params?: unknown[] }[] = [];
  const db: Db = {
    async query(sql) {
      chamadas.push({ sql });
      if (sql.includes("catalogo_sincronizado_em")) {
        return { values: [{ valor: "2026-11-17T12:00:00.000Z" }] };
      }
      return { values: [] };
    },
    async execute(sql, params) {
      chamadas.push({ sql, params });
      return { changes: 1 };
    },
  };
  return { db, chamadas };
}

type Resposta = { status: number; corpo: () => Promise<unknown> };
const ok = (data: unknown): Resposta => ({ status: 200, corpo: async () => data });

function buscarFake(respostas: Record<string, Resposta>) {
  const urls: string[] = [];
  const buscar = async (url: string): Promise<Resposta> => {
    urls.push(url);
    const r = respostas[url];
    if (!r) throw new Error(`sem resposta para ${url}`);
    return r;
  };
  return { buscar, urls };
}

const PRODUTO: ProdutoEmCache = {
  id: "p1",
  codigo: "SKU1",
  nome: "Sabonete",
  preco_cents: 499,
  controla_estoque: true,
  quantidade: 3,
  ativo: true,
};

const CONTATO: ContatoEmCache = {
  id: "c1",
  nome: "Maria",
  documento: "123",
  cidade: "Joinville",
  limite_cents: 10000,
};

describe("sincronizarCatalogo", () => {
  it("troca as três tabelas e carimba com o relógio injetado", async () => {
    const { db, chamadas } = dbFake();
    const { buscar } = buscarFake({
      "/api/v1/products": ok({ data: [PRODUTO] }),
      "/api/v1/contacts": ok({ data: [CONTATO], meta: { has_more: false } }),
      "/api/v1/price-tables": ok({ data: [{ id: "t1", nome: "Padrão", desconto_pct: 5 }] }),
      "/api/v1/price-tables/t1/items": ok({ data: [{ produto_id: "p1" }] }),
    });

    const r = await sincronizarCatalogo(db, buscar, () => "2026-11-17T15:00:00.000Z");

    expect(r).toEqual({ produtos: 1, contatos: 1, tabelas: 1 });
    // TROCA, não mescla: cada tabela é limpa antes do primeiro INSERT dela.
    const sqls = chamadas.map((c) => c.sql.replace(/\s+/g, " ").trim());
    for (const tabela of ["catalogo_produtos", "catalogo_contatos", "catalogo_tabelas"]) {
      const del = sqls.findIndex((s) => s === `DELETE FROM ${tabela}`);
      const ins = sqls.findIndex((s) => s.startsWith(`INSERT INTO ${tabela}`));
      expect(del, `sem DELETE em ${tabela}`).toBeGreaterThanOrEqual(0);
      expect(ins, `sem INSERT em ${tabela}`).toBeGreaterThan(del);
    }
    // O carimbo é o `agora` injetado — não o relógio da máquina.
    const carimbo = chamadas.find((c) => c.sql.includes("catalogo_sincronizado_em"));
    expect(carimbo?.params).toEqual(["2026-11-17T15:00:00.000Z"]);
  });

  it("download que falha NÃO apaga o catálogo antigo", async () => {
    const { db, chamadas } = dbFake();
    const { buscar } = buscarFake({
      "/api/v1/products": { status: 500, corpo: async () => ({}) },
    });

    await expect(sincronizarCatalogo(db, buscar)).rejects.toThrow("servidor respondeu 500");
    // Os três downloads vêm ANTES do primeiro DELETE: nada foi apagado.
    expect(chamadas.filter((c) => c.sql.startsWith("DELETE"))).toEqual([]);
  });

  it("200 SEM lista não apaga o catálogo — resposta vazia ≠ catálogo vazio", async () => {
    // Um proxy/erro de shape que devolva 200 com `{}` era lido como "lista
    // vazia": o DELETE rodava, o catálogo do aparelho zerava e a tela passava a
    // exigir "abra o sistema com internet" no meio da rota. Servidor sem
    // produto responde `data: []` — isso continua sendo catálogo vazio de
    // verdade.
    const { db, chamadas } = dbFake();
    const { buscar } = buscarFake({
      "/api/v1/products": ok({}),
      "/api/v1/contacts": ok({ data: [], meta: { has_more: false } }),
      "/api/v1/price-tables": ok({ data: [] }),
    });

    await expect(sincronizarCatalogo(db, buscar)).rejects.toThrow(
      "produtos: resposta sem lista",
    );
    expect(chamadas.filter((c) => c.sql.startsWith("DELETE"))).toEqual([]);
  });

  it("catálogo legitimamente vazio (data: []) é aceito", async () => {
    const { db } = dbFake();
    const { buscar } = buscarFake({
      "/api/v1/products": ok({ data: [] }),
      "/api/v1/contacts": ok({ data: [], meta: { has_more: false } }),
      "/api/v1/price-tables": ok({ data: [] }),
    });

    expect(await sincronizarCatalogo(db, buscar)).toEqual({
      produtos: 0,
      contatos: 0,
      tabelas: 0,
    });
  });

  it("contatos paginam pelo cursor e param quando has_more é falso", async () => {
    const { db } = dbFake();
    const { buscar, urls } = buscarFake({
      "/api/v1/products": ok({ data: [] }),
      "/api/v1/contacts": ok({ data: [CONTATO], meta: { has_more: true, cursor: "abc" } }),
      "/api/v1/contacts?cursor=abc": ok({ data: [CONTATO], meta: { has_more: false } }),
      "/api/v1/price-tables": ok({ data: [] }),
    });

    const r = await sincronizarCatalogo(db, buscar);

    expect(r.contatos).toBe(2);
    expect(urls.filter((u) => u.startsWith("/api/v1/contacts"))).toEqual([
      "/api/v1/contacts",
      "/api/v1/contacts?cursor=abc",
    ]);
  });

  it("cursor quebrado não baixa para sempre: teto de 20 páginas", async () => {
    const { db } = dbFake();
    let pagina = 0;
    const buscar = async (url: string): Promise<Resposta> => {
      if (url.startsWith("/api/v1/contacts")) {
        pagina += 1;
        return ok({ data: [CONTATO], meta: { has_more: true, cursor: `c${pagina}` } });
      }
      if (url === "/api/v1/products") return ok({ data: [] });
      if (url === "/api/v1/price-tables") return ok({ data: [] });
      throw new Error(`sem resposta para ${url}`);
    };

    const r = await sincronizarCatalogo(db, buscar);

    expect(pagina).toBe(20);
    expect(r.contatos).toBe(20);
  });
});

describe("catálogo do aparelho (token)", () => {
  it("acumula as páginas e grava UMA vez no fim", async () => {
    const { db, chamadas } = dbFake();
    const { buscar, urls } = buscarFake({
      "/api/v1/device/catalog": ok({
        data: {
          produtos: [PRODUTO],
          contatos: [CONTATO],
          tabelas: [{ id: "t1", nome: "Padrão", desconto_pct: 5, itens: [] }],
        },
        meta: { has_more: true, cursor: "pagina-2" },
      }),
      "/api/v1/device/catalog?cursor=pagina-2": ok({
        data: { contatos: [{ ...CONTATO, id: "c2", nome: "João" }] },
        meta: { has_more: false, cursor: null },
      }),
    });

    const r = await sincronizarCatalogoDoDispositivo(db, buscar);

    expect(urls).toHaveLength(2);
    expect(r).toEqual({ produtos: 1, contatos: 2, tabelas: 1 });
    // Troca, não mescla: um DELETE por tabela, no fim do download inteiro.
    expect(chamadas.filter((c) => c.sql.startsWith("DELETE"))).toHaveLength(3);
  });

  it("página seguinte sem produtos é normal (só contatos)", async () => {
    // O servidor manda produtos/tabelas só na primeira; exigir de novo na
    // segunda quebraria o sync no meio de uma base grande.
    const { db } = dbFake();
    const { buscar } = buscarFake({
      "/api/v1/device/catalog": ok({
        data: { produtos: [], contatos: [], tabelas: [] },
        meta: { has_more: true, cursor: "p2" },
      }),
      "/api/v1/device/catalog?cursor=p2": ok({
        data: { contatos: [CONTATO] },
        meta: { has_more: false },
      }),
    });
    expect(await sincronizarCatalogoDoDispositivo(db, buscar)).toEqual({
      produtos: 0,
      contatos: 1,
      tabelas: 0,
    });
  });

  it("resposta sem lista NÃO apaga o catálogo antigo", async () => {
    const { db, chamadas } = dbFake();
    const { buscar } = buscarFake({
      "/api/v1/device/catalog": ok({ data: {} }),
    });
    await expect(sincronizarCatalogoDoDispositivo(db, buscar)).rejects.toThrow(
      "resposta sem lista",
    );
    expect(chamadas.filter((c) => c.sql.startsWith("DELETE"))).toEqual([]);
  });

  it("primeira página sem produtos/tabelas também não apaga", async () => {
    const { db, chamadas } = dbFake();
    const { buscar } = buscarFake({
      "/api/v1/device/catalog": ok({
        data: { contatos: [CONTATO] },
        meta: { has_more: false },
      }),
    });
    await expect(sincronizarCatalogoDoDispositivo(db, buscar)).rejects.toThrow(
      "primeira página sem produtos",
    );
    expect(chamadas.filter((c) => c.sql.startsWith("DELETE"))).toEqual([]);
  });
});

describe("carimboDoCatalogo", () => {
  it("devolve o valor gravado em meta", async () => {
    const { db } = dbFake();
    expect(await carimboDoCatalogo(db)).toBe("2026-11-17T12:00:00.000Z");
  });
});
