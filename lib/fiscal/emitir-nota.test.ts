/**
 * A EMISSÃO E O STATUS DO PEDIDO — quem pode virar nota.
 *
 * A regra nasceu estreita ("só faturado vira nota") e ficou espalhada em dois
 * lugares com textos diferentes: `lib/fiscal/emitir-nota.ts` e
 * `app/api/v1/invoices/validar/route.ts`. O pedido do dono em 2026-11-03 foi
 * emitir também depois da saída da mercadoria — e a expedição leva o pedido
 * para `expedido` ao embarcar e para `entregue` quando a rota termina. Antes
 * disso, quem faturava depois da entrega ficava travado num pedido real.
 *
 * O que este arquivo mede é a DECISÃO, com banco de mentira: o teste que
 * importa é "aprovado recusa" e "expedido/entregue emitem", não a aritmética
 * fiscal, que tem teste próprio no sidecar.
 */
import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/types";
import { emitirNota } from "@/lib/fiscal/emitir-nota";
import { statusFaturavel } from "@/lib/schemas/fiscal";

const PEDIDO_ID = "33333333-3333-4333-8333-333333333333";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const USUARIO_ID = "11111111-1111-4111-8111-111111111111";

const NOTA = {
  id: "nota-1",
  order_id: PEDIDO_ID,
  serie: "1",
  status: "em_emissao",
  provedor: "stub",
  total_cents: 1000,
};

interface Resultado {
  data: unknown;
  error: unknown;
}

/**
 * Uma corrente do PostgREST falsa: todo método de filtro devolve a si mesma e
 * o terminal devolve o resultado. O `then` existe porque `insert(...)` é
 * aguardado direto (sem `.select()`), como na chamada real.
 */
function corrente(resultado: Resultado) {
  const b: Record<string, unknown> = {};
  for (const metodo of ["select", "eq", "neq", "in", "order", "limit"]) {
    b[metodo] = () => b;
  }
  b.maybeSingle = async () => resultado;
  b.single = async () => resultado;
  b.then = (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) =>
    Promise.resolve(resultado).then(ok, falha);
  return b;
}

/** O banco da emissão: config, pedido com o status em teste e nenhuma nota viva. */
function bancoFalso(status: string) {
  const escritas: string[] = [];

  const from = (tabela: string) => {
    if (tabela === "fiscal_settings") {
      return corrente({
        data: {
          serie: "1",
          natureza_operacao: "Venda de mercadoria",
          cfop_padrao: "5102",
          emitente_documento: "12345678000199",
          provedor: "stub",
        },
        error: null,
      });
    }
    if (tabela === "commercial_orders") {
      // Lista, e não linha única: a emissão agrupada busca os pedidos com
      // `.in("id", ids)` (0294) e trata o resultado como array.
      return corrente({
        data: [
          {
            id: PEDIDO_ID,
            numero: 7,
            cliente_nome: "Cliente",
            cliente_documento: null,
            // Sem contato o destinatário sai do próprio pedido — o banco falso
            // não tem a tabela `contacts`.
            contact_id: null,
            total_cents: 1000,
            frete_cents: 0,
            status,
          },
        ],
        error: null,
      });
    }
    if (tabela === "invoice_orders") {
      // Nenhum vínculo: o pedido ainda não está em nota nenhuma. A escrita do
      // vínculo novo (0294) acontece depois do insert da nota.
      return {
        ...corrente({ data: [], error: null }),
        insert: (valor: unknown) => {
          escritas.push(`invoice_orders.insert ${JSON.stringify(valor)}`);
          return corrente({ data: null, error: null });
        },
      };
    }
    if (tabela === "invoices") {
      const leitura = corrente({ data: null, error: null });
      const escrita = corrente({ data: NOTA, error: null });
      return {
        ...leitura,
        insert: (valor: unknown) => {
          escritas.push(`invoices.insert ${JSON.stringify(valor)}`);
          return escrita;
        },
      };
    }
    return {
      insert: (valor: unknown) => {
        escritas.push(`${tabela}.insert ${JSON.stringify(valor)}`);
        return corrente({ data: null, error: null });
      },
    };
  };

  return { from, escritas };
}

function emitir(status: string) {
  const banco = bancoFalso(status);
  return {
    banco,
    promessa: emitirNota({
      supabase: banco as never,
      admin: banco as never,
      orgId: ORG_ID,
      userId: USUARIO_ID,
      requestId: "req-1",
      orderId: PEDIDO_ID,
    }),
  };
}

/**
 * Banco falso com DOIS pedidos e contatos distintos — o caso do agrupamento
 * que precisa ser recusado.
 */
function bancoDeDoisClientes() {
  const escritas: string[] = [];
  const from = (tabela: string) => {
    if (tabela === "fiscal_settings") {
      return corrente({
        data: {
          serie: "1",
          natureza_operacao: "Venda de mercadoria",
          cfop_padrao: "5102",
          emitente_documento: "12345678000199",
          provedor: "stub",
        },
        error: null,
      });
    }
    if (tabela === "commercial_orders") {
      return corrente({
        data: [
          {
            id: PEDIDO_ID,
            numero: 7,
            cliente_nome: "Cliente A",
            cliente_documento: "11111111000111",
            contact_id: "contato-a",
            total_cents: 1000,
            frete_cents: 0,
            status: "faturado",
          },
          {
            id: "44444444-4444-4444-8444-444444444444",
            numero: 8,
            cliente_nome: "Cliente B",
            cliente_documento: "22222222000122",
            contact_id: "contato-b",
            total_cents: 2000,
            frete_cents: 0,
            status: "faturado",
          },
        ],
        error: null,
      });
    }
    if (tabela === "invoice_orders") return corrente({ data: [], error: null });
    return {
      ...corrente({ data: null, error: null }),
      insert: (valor: unknown) => {
        escritas.push(`${tabela}.insert ${JSON.stringify(valor)}`);
        return corrente({ data: null, error: null });
      },
    };
  };
  return { from, escritas };
}

describe("agrupamento de pedidos (0294)", () => {
  it("recusa juntar pedidos de clientes diferentes — a nota tem UM destinatário", async () => {
    const banco = bancoDeDoisClientes();
    const erro = await emitirNota({
      supabase: banco as never,
      admin: banco as never,
      orgId: ORG_ID,
      userId: USUARIO_ID,
      requestId: "req-1",
      orderId: PEDIDO_ID,
      orderIds: [PEDIDO_ID, "44444444-4444-4444-8444-444444444444"],
    }).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ApiError);
    expect((erro as ApiError).status).toBe(422);
    expect((erro as ApiError).message).toContain("mesmo cliente");
    // Nada foi escrito: a recusa acontece antes de a nota existir.
    expect(banco.escritas.some((e) => e.startsWith("invoices.insert"))).toBe(false);
  });

  it("grava os vínculos pelo service role — a 0294 só dá SELECT ao usuário", async () => {
    // Medido em 05/11/2026: com o client da sessão o INSERT em
    // `invoice_orders` voltava 42501, a nota já tinha nascido e ficava órfã
    // em `em_emissao` — sem job, sem evento, sem nunca emitir. O vínculo é
    // escrita de service role (0294), e este teste trava a escolha do client.
    const banco = bancoFalso("faturado");
    const negado = {
      then: (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) =>
        Promise.resolve({
          data: null,
          error: { message: "new row violates row-level security policy" },
        }).then(ok, falha),
    };
    const supabase = {
      from: (tabela: string) =>
        tabela === "invoice_orders"
          ? { ...banco.from(tabela), insert: () => negado }
          : banco.from(tabela),
    };
    const admin = {
      from: (tabela: string) =>
        tabela === "invoice_orders"
          ? {
              insert: (valor: unknown) => {
                banco.escritas.push(`admin.invoice_orders.insert ${JSON.stringify(valor)}`);
                return {
                  then: (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) =>
                    Promise.resolve({ data: null, error: null }).then(ok, falha),
                };
              },
            }
          : banco.from(tabela),
    };

    await expect(
      emitirNota({
        supabase: supabase as never,
        admin: admin as never,
        orgId: ORG_ID,
        userId: USUARIO_ID,
        requestId: "req-1",
        orderId: PEDIDO_ID,
      }),
    ).resolves.toBeTruthy();
    expect(banco.escritas.some((e) => e.startsWith("admin.invoice_orders.insert"))).toBe(true);
  });
});

describe("status do pedido que vira nota", () => {
  it("faturado, expedido e entregue são faturáveis", () => {
    expect(statusFaturavel("faturado")).toBe(true);
    expect(statusFaturavel("expedido")).toBe(true);
    expect(statusFaturavel("entregue")).toBe(true);
  });

  it("intenção e desfecho não viram nota", () => {
    for (const status of ["rascunho", "em_analise", "aprovado", "cancelado"]) {
      expect(statusFaturavel(status), status).toBe(false);
    }
  });
});

describe("emitirNota", () => {
  it("emite para pedido expedido — a mercadoria saiu antes da nota", async () => {
    const { banco, promessa } = emitir("expedido");
    await expect(promessa).resolves.toMatchObject({ id: "nota-1" });
    expect(banco.escritas.some((e) => e.startsWith("invoices.insert"))).toBe(true);
  });

  it("emite para pedido entregue", async () => {
    const { promessa } = emitir("entregue");
    await expect(promessa).resolves.toMatchObject({ id: "nota-1" });
  });

  it("recusa pedido aprovado e nomeia o que vale", async () => {
    const { banco, promessa } = emitir("aprovado");
    const erro = await promessa.catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ApiError);
    expect((erro as ApiError).status).toBe(422);
    expect((erro as ApiError).message).toContain("faturado, expedido ou entregue");
    // A recusa acontece ANTES de qualquer escrita: nenhuma nota nasce condenada.
    expect(banco.escritas).toEqual([]);
  });
});
