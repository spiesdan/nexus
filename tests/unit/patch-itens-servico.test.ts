/**
 * `aplicarPatchDeItens` — a aritmética e as guardas do patch de itens.
 *
 * ─── POR QUE UM BANCO EM MEMÓRIA, E NÃO MAIS UM DUBLÊ DE CADEIA ────────────
 *
 * O que este serviço faz é ler um pedido, ler os itens, aplicar
 * adicionar/remover/ajustar e recalcular o total. A parte que vale prova é essa:
 * `subtotal`, desconto geral, frete e reindexação de `posicao`. Um dublê que
 * devolve valores fixos não prova nada disso — ele devolveria o número que o
 * próprio teste escreveu.
 *
 * O banco aqui é uma tabela porVELOCIDADE. Assim o total do teste é consequência
 * do que o serviço calculou, e o teste falha se a conta fechar errado.
 *
 * ─── O QUE CADA TESTE TRAVA ───────────────────────────────────────────────
 *
 * `ajustar` que não recalcula subtotal (o bug que faria a tela mostrar uma
 * linha e o total de outra), desconto geral que não reaplica, `posicao` que
 * fica com buraco depois de remover, e id alheio aceito em silêncio.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

import { aplicarPatchDeItens } from "@/lib/comercial/patch-itens";

vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const ORG = "22222222-2222-4222-8222-222222222222";
const PEDIDO = "33333333-3333-4333-8333-333333333333";
const PROD_A = "44444444-4444-4444-8444-444444444444";
const PROD_B = "55555555-5555-4555-8555-555555555555";
const REQ = "req-1";

type Linha = Record<string, unknown> & { id: string };

interface Tabelas {
  commercial_orders: Linha[];
  commercial_order_items: Linha[];
  catalog_products: Linha[];
}

/**
 * Cliente Supabase mínimo, só com o que o serviço chama. A cadeia é
 * auto-referente de propósito: o filtro real encadeia `.eq().eq()` e um dublê
 * raso falha com `not a function`, que parece bug do serviço e é typo do dublê.
 */
function banco(tabelas: Tabelas): never {
  const client = {
    from(nome: keyof Tabelas) {
      // Os filtros acumulados viajam num objeto só; cada método devolve a
      // MESMA cadeia, e é ela que vira promise no fim.
      const filtros: Record<string, unknown> = {};
      const inativos: Record<string, unknown[]> = {};
      const mudas: Linha[] = [];
      const pendentesDelete: boolean[] = [];
      const linhas = () => {
        let out = tabelas[nome].filter((l) =>
          Object.entries(filtros).every(([k, v]) => l[k] === v),
        );
        for (const [coluna, valores] of Object.entries(inativos)) {
          out = out.filter((l) => valores.includes(l[coluna]));
        }
        return out;
      };
      const q: Record<string, unknown> = {
        select: () => q,
        insert: (novas: Linha[]) => {
          tabelas[nome].push(...novas);
          return Promise.resolve({ data: novas, error: null });
        },
        eq: (c: string, v: unknown) => {
          filtros[c] = v;
          return q;
        },
        in: (c: string, v: unknown[]) => {
          inativos[c] = v;
          return q;
        },
        order: () => q,
        maybeSingle: () => Promise.resolve({ data: linhas()[0] ?? null, error: null }),
        // `update` NÃO é aplicado na hora: o serviço encadeia `.eq()` depois
        // dele, e devolver promise aqui quebraria a cadeia com `not a function`.
        // A gravação fica pendente e sai no `then` — que é quando a leitura
        // do teste acontece, e é o mesmo instante em que o serviço real
        // commitaria.
        update: (muda: Linha | Linha[]) => {
          // O Supabase aceita objeto OU array no `update`, e o serviço usa os
          // dois: array para os itens (um por linha) e objeto para o total do
          // pedido (colunas de uma linha só). Normalizar aqui evita a
          // divergência silenciosa de "o duplo é que não sabia".
          mudas.push(...(Array.isArray(muda) ? muda : [muda]));
          return q;
        },
        // `delete` também é ADIADO, pelo mesmo motivo: `.delete().eq().in()`
        // executa o filtro DEPOIS da chamada. Aplicar na hora apagaria a
        // tabela inteira — o filtro viria tarde demais para impedir.
        delete: () => {
          pendentesDelete.push(true);
          return q;
        },
        then: (ok: (v: unknown) => void) => {
          if (pendentesDelete.length > 0) {
            const alvos = new Set(linhas().map((l) => l.id));
            tabelas[nome] = tabelas[nome].filter((l) => !alvos.has(l.id));
            pendentesDelete.length = 0;
          }
          for (const m of mudas) {
            // Sem `id`, é update de colunas em toda a linha filtrada — é o
            // caso do total do pedido. Com `id`, é a linha certa.
            const alvo =
              m.id === undefined ? linhas() : tabelas[nome].filter((l) => l.id === m.id);
            for (const l of alvo) Object.assign(l, m);
          }
          mudas.length = 0;
          return Promise.resolve({ data: linhas(), error: null }).then(ok);
        },
      };
      return q;
    },
  };
  return client as never;
}

function cenario(over: Partial<Tabelas> = {}): Tabelas {
  return {
    commercial_orders: [
      {
        id: PEDIDO,
        organization_id: ORG,
        status: "rascunho",
        desconto_pct: 0,
        desconto_cents: 0,
        frete_cents: 0,
        total_cents: 0,
      },
      {
        id: "outro-pedido",
        organization_id: "99999999-9999-4999-8999-999999999999",
        status: "rascunho",
        desconto_pct: 0,
        desconto_cents: 0,
        frete_cents: 0,
        total_cents: 0,
      },
    ],
    commercial_order_items: [
      {
        id: "i1",
        order_id: PEDIDO,
        organization_id: ORG,
        posicao: 0,
        quantidade: 2,
        preco_unit_cents: 1000,
        desconto_pct: 0,
        subtotal_cents: 2000,
        produto_codigo: "A",
        produto_nome: "A",
      },
      {
        id: "i2",
        order_id: PEDIDO,
        organization_id: ORG,
        posicao: 1,
        quantidade: 1,
        preco_unit_cents: 5000,
        desconto_pct: 0,
        subtotal_cents: 5000,
        produto_codigo: "B",
        produto_nome: "B",
      },
    ],
    catalog_products: [
      { id: PROD_A, organization_id: ORG, codigo: "A", nome: "Produto A" },
      { id: PROD_B, organization_id: ORG, codigo: "B", nome: "Produto B" },
    ],
    ...over,
  } as Tabelas;
}

const base = {
  pedidoId: PEDIDO,
  organizationId: ORG,
  userId: null,
  requestId: REQ,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("aplicarPatchDeItens", () => {
  it("ajustar recalcula o subtotal do item e o total do pedido", async () => {
    const t = cenario();
    // 2 un. x R$10,00 = R$20,00; 1 un. x R$70,00 = R$70,00. Total R$90,00 = 9000.
    const r = await aplicarPatchDeItens(banco(t), {
      ...base,
      patch: { adicionar: [], remover: [], ajustar: [{ id: "i2", preco_unit_cents: 7000 }] },
    });
    expect(r.ok).toBe(true);
    expect(r.subtotal_cents).toBe(9000);
    expect(r.total_cents).toBe(9000);
    const linha = t.commercial_order_items.find((i) => i.id === "i2")!;
    expect(linha.subtotal_cents).toBe(7000);
  });

  it("MUTAÇÃO: ajustar sem recalcular subtotal derruba o total", async () => {
    // Se `subtotalDoItem` saísse do laço de `ajustar`, o item gravaria 7000 mas
    // o total seria calculado sobre o 5000 antigo — 2000 de diferença.
    const t = cenario();
    const r = await aplicarPatchDeItens(banco(t), {
      ...base,
      patch: { adicionar: [], remover: [], ajustar: [{ id: "i2", preco_unit_cents: 7000 }] },
    });
    expect(r.total_cents).not.toBe(7000);
  });

  it("quantidade ajustada refleta no subtotal do item", async () => {
    const t = cenario();
    await aplicarPatchDeItens(banco(t), {
      ...base,
      patch: { adicionar: [], remover: [], ajustar: [{ id: "i1", quantidade: 5 }] },
    });
    // 5 x 1000 = 5000, e 5000 do i2 = 10.000.
    expect(t.commercial_order_items.find((i) => i.id === "i1")!.subtotal_cents).toBe(5000);
    expect(t.commercial_orders[0]!.total_cents).toBe(10000);
  });

  it("desconto por item entra no subtotal antes do total", async () => {
    const t = cenario();
    const r = await aplicarPatchDeItens(banco(t), {
      ...base,
      patch: { adicionar: [], remover: [], ajustar: [{ id: "i1", desconto_pct: 50 }] },
    });
    // i1: 2 x 1000 x 50% = 1000. i2: 5000. Total 6000.
    expect(r.subtotal_cents).toBe(6000);
  });

  it("remover tira a linha e o valor dela do total", async () => {
    const t = cenario();
    const r = await aplicarPatchDeItens(banco(t), {
      ...base,
      patch: { adicionar: [], remover: ["i2"], ajustar: [] },
    });
    expect(r.removidos).toBe(1);
    expect(r.total_cents).toBe(2000);
    expect(t.commercial_order_items.some((i) => i.id === "i2")).toBe(false);
  });

  it("remover reindexa posicao sem buraco", async () => {
    // Sem a reindexação, remover i1 deixaria 0 ausente e i2 em 1 — e o próximo
    // `adicionar` nasceria em 2, deixando a lista 1,2 com um 0 faltando. Numa
    // tela que ordena por `posicao`, isso aparece como "o primeiro item sumiu".
    const t = cenario();
    await aplicarPatchDeItens(banco(t), {
      ...base,
      patch: {
        adicionar: [{ quantidade: 1, preco_unit_cents: 100, desconto_pct: 0 }],
        remover: ["i1"],
        ajustar: [],
      },
    });
    const posicoes = t.commercial_order_items
      .filter((i) => i.order_id === PEDIDO)
      .map((i) => i.posicao)
      .sort((a, b) => (a as number) - (b as number));
    expect(posicoes).toEqual([0, 1]);
  });

  it("adicionar resolve codigo e nome do catálogo", async () => {
    const t = cenario();
    const r = await aplicarPatchDeItens(banco(t), {
      ...base,
      patch: {
        adicionar: [{ product_id: PROD_A, quantidade: 1, preco_unit_cents: 100, desconto_pct: 0 }],
        remover: [],
        ajustar: [],
      },
    });
    expect(r.adicionados).toBe(1);
    const novo = t.commercial_order_items.find((i) => i.produto_nome === "Produto A");
    expect(novo).toBeDefined();
    expect(novo!.produto_codigo).toBe("A");
    expect(novo!.product_id).toBe(PROD_A);
  });

  it("item sem produto é 'avulso', com os textos de criar-pedido", async () => {
    const t = cenario();
    await aplicarPatchDeItens(banco(t), {
      ...base,
      patch: {
        adicionar: [{ quantidade: 1, preco_unit_cents: 100, desconto_pct: 0 }],
        remover: [],
        ajustar: [],
      },
    });
    const novo = t.commercial_order_items.find((i) => i.produto_nome === "Item avulso");
    expect(novo).toBeDefined();
    expect(novo!.produto_codigo).toBe("AVULSO");
  });

  it("produto_id que não existe no catálogo é recusado, com a posição", async () => {
    const t = cenario();
    const r = await aplicarPatchDeItens(banco(t), {
      ...base,
      patch: {
        adicionar: [
          { product_id: PROD_A, quantidade: 1, preco_unit_cents: 100, desconto_pct: 0 },
          { product_id: PROD_B, quantidade: 1, preco_unit_cents: 100, desconto_pct: 0 },
          { product_id: "66666666-6666-4666-8666-666666666666", quantidade: 1, preco_unit_cents: 1, desconto_pct: 0 },
        ],
        remover: [],
        ajustar: [],
      },
    });
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("produto_desconhecido");
    // 0-based: o terceiro item da lista é o índice 2.
    expect(r.posicao).toBe(2);
    // E nada foi gravado — a recusa vem ANTES do insert.
    expect(t.commercial_order_items).toHaveLength(2);
  });

  it("remover id que não é item DESTE pedido é recusado", async () => {
    // Sem esta guarda, o `delete`rodaria com um id alheio: o item sumiria da
    // tela sem o total mudar, e o pedido ficaria com linha que não existe.
    const t = cenario();
    const r = await aplicarPatchDeItens(banco(t), {
      ...base,
      patch: { adicionar: [], remover: ["99999999-9999-4999-8999-999999999999"], ajustar: [] },
    });
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("item_desconhecido");
    expect(t.commercial_order_items).toHaveLength(2);
  });

  it("ajustar id alheio é recusado antes de gravar", async () => {
    const t = cenario();
    const r = await aplicarPatchDeItens(banco(t), {
      ...base,
      patch: {
        adicionar: [],
        remover: [],
        ajustar: [{ id: "99999999-9999-4999-8999-999999999999", quantidade: 9 }],
      },
    });
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("item_desconhecido");
    expect(t.commercial_order_items.find((i) => i.id === "i1")!.quantidade).toBe(2);
  });

  it("desconto geral reaplicado sobre o novo subtotal, e frete preservado", async () => {
    const t = cenario();
    t.commercial_orders[0]!.desconto_pct = 10;
    t.commercial_orders[0]!.frete_cents = 800;
    // Itens 7000 de subtotal; 10% = 700; + 800 de frete = 7100.
    const r = await aplicarPatchDeItens(banco(t), {
      ...base,
      patch: {
        adicionar: [],
        remover: ["i2"],
        ajustar: [{ id: "i1", preco_unit_cents: 3500 }],
      },
    });
    expect(r.subtotal_cents).toBe(7000);
    expect(r.total_cents).toBe(7100);
    expect(t.commercial_orders[0]!.desconto_cents).toBe(700);
    expect(t.commercial_orders[0]!.frete_cents).toBe(800);
  });

  it("MUTAÇÃO: ignorar o desconto geral faz o total fechar errado", async () => {
    // A guarda: sem `desconto_pct`, o total viraria 7800 (7000 + 800) e o
    // dono veria R$78,00 num pedido de R$71,00.
    const t = cenario();
    t.commercial_orders[0]!.desconto_pct = 10;
    t.commercial_orders[0]!.frete_cents = 800;
    const r = await aplicarPatchDeItens(banco(t), {
      ...base,
      patch: { adicionar: [], remover: ["i2"], ajustar: [{ id: "i1", preco_unit_cents: 3500 }] },
    });
    expect(r.total_cents).not.toBe(7800);
  });

  it("MUTAÇÃO: ignorar o frete no total também fecha errado", async () => {
    const t = cenario();
    t.commercial_orders[0]!.frete_cents = 800;
    const r = await aplicarPatchDeItens(banco(t), {
      ...base,
      patch: { adicionar: [], remover: [], ajustar: [] },
    });
    // Sem frete, 7000; com frete, 7800.
    expect(r.total_cents).toBe(7800);
  });

  it("pedido de outra organização é 'nao_encontrado'", async () => {
    const t = cenario();
    const r = await aplicarPatchDeItens(banco(t), {
      ...base,
      pedidoId: "outro-pedido",
      patch: { adicionar: [], remover: ["i1"], ajustar: [] },
    });
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("nao_encontrado");
  });

  it("aceita alterar pedido já PRONTO — a regra que o dono pediu para mudar", async () => {
    const t = cenario();
    t.commercial_orders[0]!.status = "faturado";
    const r = await aplicarPatchDeItens(banco(t), {
      ...base,
      patch: { adicionar: [], remover: [], ajustar: [{ id: "i1", quantidade: 10 }] },
    });
    // 10 x 1000 = 10.000, mais 5.000 do i2 = 15.000.
    expect(r.ok).toBe(true);
    expect(r.total_cents).toBe(15000);
  });
});