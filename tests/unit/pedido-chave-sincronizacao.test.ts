/**
 * POST /api/v1/commercial-orders COM `chave_sincronizacao` — o celular manda
 * duas vezes e o servidor cria uma.
 *
 * ─── O defeito que estes testes travam ──────────────────────────────────────
 *
 * O sincronizador offline manda o pedido, o timeout estoura, e ele manda de
 * novo sem saber se o primeiro chegou. Sem chave, o segundo POST cria um
 * SEGUNDO pedido: mesmo cliente, mesmos itens, outro número. O vendedor só
 * descobre no fechamento do mês.
 *
 * ─── O que o fake precisa fazer de verdade ─────────────────────────────────
 *
 * Aplicar os `.eq()` como filtro (org E chave), porque é o filtro que impede
 * uma org de ver o pedido da outra. Um fake que devolve "o pedido" sem olhar
 * os filtros faria o teste de isolamento entre orgs passar sem que o código
 * filtrasse nada — medir o fake, não a função.
 */
import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

import { audit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const ORG = "11111111-1111-4111-8111-111111111111";
const ORG_OUTRA = "22222222-2222-4222-8222-222222222222";
const CHAVE = "33333333-3333-4333-8333-333333333333";

interface LinhaPedido {
  id: string;
  organization_id: string;
  numero: number;
  cliente_nome: string;
  status: string;
  chave_sincronizacao: string | null;
}

/**
 * Um "banco" de verdade em memória: linhas guardadas, filtros aplicados.
 *
 * `pedidos` é o estado; cada `from()` devolve uma cadeia que acumula `.eq()` e
 * só no `maybeSingle`/`single` filtra de verdade — o mesmo contrato do
 * PostgREST, onde a ordem dos `.eq()` não importa e todos valem.
 */
function bancoMemoria(seed: LinhaPedido[] = []) {
  const pedidos: LinhaPedido[] = [...seed];
  const registro = { insertsPedidos: 0, selectsChave: 0 };
  let proximoNumero = 100;
  let falharInsertCom: { code: string; message: string } | null = null;

  function cadeia(tabela: string) {
    const filtros: Record<string, unknown> = {};
    const c: Record<string, unknown> = {};
    c.select = (_cols?: string, _opts?: unknown) => c;
    c.eq = (col: string, v: unknown) => {
      filtros[col] = v;
      return c;
    };
    c.rpc = undefined;
    c.maybeSingle = async () => {
      if (tabela === "commercial_policies") return { data: null, error: null };
      if (tabela === "commercial_orders") {
        const achado = pedidos.find((p) =>
          Object.entries(filtros).every(([col, v]) => (p as unknown as Record<string, unknown>)[col] === v),
        );
        if (filtros.chave_sincronizacao !== undefined) registro.selectsChave++;
        return { data: achado ?? null, error: null };
      }
      return { data: null, error: null };
    };
    c.single = async () => {
      const achado = pedidos.find((p) =>
        Object.entries(filtros).every(([col, v]) => (p as unknown as Record<string, unknown>)[col] === v),
      );
      return { data: achado ?? null, error: null };
    };
    c.insert = (valores: unknown) => {
      if (tabela === "commercial_orders") {
        const v = valores as Record<string, unknown>;
        // A unique (organization_id, chave_sincronizacao): NULL não conflita,
        // chave repetida na MESMA org sim. Entre orgs, nunca.
        const duplicada =
          v.chave_sincronizacao != null &&
          pedidos.some(
            (p) =>
              p.organization_id === v.organization_id &&
              p.chave_sincronizacao === v.chave_sincronizacao,
          );
        if (falharInsertCom || duplicada) {
          const e = falharInsertCom ?? { code: "23505", message: "duplicate key value" };
          // Simula a corrida ganha pelo outro tick: a linha dele JÁ commitou,
          // então a releitura do perdedor acha. Sem isto o teste do 23505
          // mediria "releitura de linha que não existe", que não é o caso.
          if (falharInsertCom && !duplicada && v.chave_sincronizacao != null) {
            pedidos.push({
              id: `ped-${pedidos.length + 1}`,
              organization_id: v.organization_id as string,
              numero: v.numero as number,
              cliente_nome: v.cliente_nome as string,
              status: v.status as string,
              chave_sincronizacao: v.chave_sincronizacao as string,
            });
            registro.insertsPedidos++;
          }
          falharInsertCom = null;
          return {
            select: () => ({ single: async () => ({ data: null, error: e }) }),
          };
        }
        const linha: LinhaPedido = {
          id: `ped-${pedidos.length + 1}`,
          organization_id: v.organization_id as string,
          numero: v.numero as number,
          cliente_nome: v.cliente_nome as string,
          status: v.status as string,
          chave_sincronizacao: (v.chave_sincronizacao as string | null) ?? null,
        };
        pedidos.push(linha);
        registro.insertsPedidos++;
        return {
          select: () => ({ single: async () => ({ data: linha, error: null }) }),
        };
      }
      // commercial_order_items
      return { error: null };
    };
    c.delete = () => ({ eq: () => Promise.resolve({ error: null }) });
    c.update = () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) });
    return c;
  }

  const cliente = {
    from: (tabela: string) => cadeia(tabela),
    rpc: async (fn: string) => {
      if (fn === "fn_proximo_numero_pedido") return { data: proximoNumero++, error: null };
      return { data: null, error: null };
    },
  };

  return {
    cliente: cliente as never,
    pedidos,
    registro,
    simularCorridaNoInsert() {
      falharInsertCom = {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "commercial_orders_org_chave_sincronizacao_uidx"',
      };
    },
  };
}

function sessao() {
  const user = { id: "user-1" } as AuthUser;
  vi.mocked(requireRole).mockImplementation(async (min: Role) =>
    ROLE_RANK["agent" as Role] >= ROLE_RANK[min]
      ? { ok: true, user, org: { orgId: ORG, name: "Org", role: "agent" as Role } }
      : { ok: false, response: fail("forbidden_role", "x", 403, {}) },
  );
}

function req(corpo: unknown) {
  return new NextRequest("http://x/api/v1/commercial-orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

function corpoComChave(chave?: string | null) {
  return {
    cliente_nome: "Cliente do Sync",
    status: "rascunho",
    ...(chave === undefined ? {} : { chave_sincronizacao: chave }),
    itens: [{ product_id: null, quantidade: 2, preco_unit_cents: 1500, desconto_pct: 0 }],
  };
}

function ligarBanco(mem: ReturnType<typeof bancoMemoria>) {
  vi.mocked(createClient).mockResolvedValue(mem.cliente);
  vi.mocked(createAdminClient).mockReturnValue(mem.cliente);
}

beforeEach(() => {
  vi.clearAllMocks();
  sessao();
});

describe("POST /api/v1/commercial-orders com chave_sincronizacao", () => {
  it("cria com 201 e grava a chave", async () => {
    const mem = bancoMemoria();
    ligarBanco(mem);
    const { POST } = await import("@/app/api/v1/commercial-orders/route");

    const res = await POST(req(corpoComChave(CHAVE)));
    expect(res.status).toBe(201);
    const corpo = (await res.json()) as { data: Record<string, unknown> };
    expect(corpo.data.ja_existia).toBe(false);
    expect(corpo.data.numero).toBe(100);
    expect(mem.pedidos).toHaveLength(1);
    expect(mem.pedidos[0]?.chave_sincronizacao).toBe(CHAVE);
  });

  it("o retry com a mesma chave devolve o pedido com 200 e NÃO cria outro", async () => {
    // O caso central: timeout estourou, o celular mandou de novo.
    const mem = bancoMemoria();
    ligarBanco(mem);
    const { POST } = await import("@/app/api/v1/commercial-orders/route");

    const r1 = await POST(req(corpoComChave(CHAVE)));
    expect(r1.status).toBe(201);
    const r2 = await POST(req(corpoComChave(CHAVE)));
    expect(r2.status).toBe(200);

    const b2 = (await r2.json()) as { data: Record<string, unknown> };
    expect(b2.data.ja_existia).toBe(true);
    const b1 = (await r1.json()) as { data: Record<string, unknown> };
    expect(b2.data).toMatchObject({ id: b1.data.id, numero: b1.data.numero });
    expect(mem.pedidos).toHaveLength(1);
    expect(mem.registro.insertsPedidos).toBe(1);
  });

  it("o retry NÃO queima número da sequência", async () => {
    // A diferença entre "buscar antes" e "deixar a unique derrubar": sem a
    // busca, cada retry chama `fn_proximo_numero_pedido` e joga o número fora
    // — a sequência fica cheia de buracos, e buraco em numeração fiscal é o
    // que o contador pergunta na auditoria.
    //
    // Este é o teste que distingue o caminho do lookup do caminho do 23505:
    // com o lookup desligado, o retry consome o 101 e o próximo pedido nasce
    // 102. (Medido por mutação em 10/10/2026 — sem este teste, os outros 6
    // passam com o lookup desligado.)
    const mem = bancoMemoria();
    ligarBanco(mem);
    const { POST } = await import("@/app/api/v1/commercial-orders/route");

    const r1 = await POST(req(corpoComChave(CHAVE)));
    expect(((await r1.json()) as { data: { numero: number } }).data.numero).toBe(100);
    await POST(req(corpoComChave(CHAVE)));

    const r3 = await POST(req(corpoComChave("44444444-4444-4434-8434-444444444444")));
    expect(r3.status).toBe(201);
    expect(((await r3.json()) as { data: { numero: number } }).data.numero).toBe(101);
  });
  it("o replay NÃO audita `commercial_order.created` de novo", async () => {
    // Auditar duas criações para um pedido só mente que dois nasceram — e a
    // trilha de auditoria é o lugar onde mentira custa mais caro.
    const mem = bancoMemoria();
    ligarBanco(mem);
    const { POST } = await import("@/app/api/v1/commercial-orders/route");

    await POST(req(corpoComChave(CHAVE)));
    await POST(req(corpoComChave(CHAVE)));
    const criacoes = vi
      .mocked(audit)
      .mock.calls.filter((c) => (c[0] as { action: string }).action === "commercial_order.created");
    expect(criacoes).toHaveLength(1);
  });

  it("a mesma chave em OUTRA org cria um pedido novo — a parede do tenant vale", async () => {
    // Sem o `.eq("organization_id")` na busca, o POST devolveria o pedido da
    // outra org com `ja_existia: true`: vazamento de dado disfarçado de
    // idempotência. O fake aplica os filtros como o PostgREST, então este teste
    // só passa se o código filtrar.
    const mem = bancoMemoria([
      {
        id: "ped-outra",
        organization_id: ORG_OUTRA,
        numero: 1,
        cliente_nome: "Outra org",
        status: "rascunho",
        chave_sincronizacao: CHAVE,
      },
    ]);
    ligarBanco(mem);
    const { POST } = await import("@/app/api/v1/commercial-orders/route");

    const res = await POST(req(corpoComChave(CHAVE)));
    expect(res.status).toBe(201);
    const corpo = (await res.json()) as { data: Record<string, unknown> };
    expect(corpo.data.ja_existia).toBe(false);
    expect(mem.pedidos).toHaveLength(2);
  });

  it("corrida de dois POSTs simultâneos: o segundo relê em vez de errar", async () => {
    // Os dois passam pela busca (nenhum acha), os dois inserem, e a unique
    // derruba o segundo com 23505. Sem o tratamento, o segundo vira 500 e o
    // celular tenta de novo — para descobrir que já existia.
    //
    // O fake simula fielmente: na chamada perdedora, a linha do vencedor JÁ
    // está commitada (é por isso que a releitura acha). Um 23505 sem linha
    // correspondente seria corrupção, e aí sim o 500 é a resposta honesta.
    const mem = bancoMemoria();
    ligarBanco(mem);
    mem.simularCorridaNoInsert();
    const { POST } = await import("@/app/api/v1/commercial-orders/route");

    const res = await POST(req(corpoComChave(CHAVE)));
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { data: Record<string, unknown> };
    expect(corpo.data.ja_existia).toBe(true);
    expect(corpo.data.numero).toBe(100);
    expect(mem.pedidos).toHaveLength(1);
  });

  it("chave malformada é 422 — formato válido é o que torna colisão impraticável", async () => {
    const mem = bancoMemoria();
    ligarBanco(mem);
    const { POST } = await import("@/app/api/v1/commercial-orders/route");

    const res = await POST(req(corpoComChave("nao-e-uuid")));
    expect(res.status).toBe(422);
    expect(mem.pedidos).toHaveLength(0);
  });

  it("sem a chave, o POST se comporta como antes", async () => {
    const mem = bancoMemoria();
    ligarBanco(mem);
    const { POST } = await import("@/app/api/v1/commercial-orders/route");

    const r1 = await POST(req(corpoComChave()));
    const r2 = await POST(req(corpoComChave()));
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(mem.pedidos).toHaveLength(2);
  });
});
