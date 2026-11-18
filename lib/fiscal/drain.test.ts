import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/comercial/financeiro", () => ({ gerarRecebiveis: vi.fn() }));

import { audit } from "@/lib/audit";
import { gerarRecebiveis } from "@/lib/comercial/financeiro";

import {
  autorizacaoPodeSubstituir,
  faturarPedidosDaNota,
  gerarRecebiveisDaNotaAutorizada,
  notaPodeSerTransmitida,
  pedidoViraFaturado,
  processarJob,
} from "./drain";

/**
 * A NOTA AUTORIZADA NÃO PODE SER TRANSMITIDA DE NOVO.
 *
 * Medido em 16/11/2026: o pedido 19631 recebeu DUAS NF-e autorizadas — 4641
 * (18:40, protocolo 242260552859580) e 4642 (18:44, protocolo 242260552871224).
 * A segunda transmissão sobrescreveu número, chave e XML da linha, e a 4641
 * sumiu da tela mesmo existindo no fisco.
 *
 * A trava tem três perguntas, testadas aqui:
 *
 *  1. `notaPodeSerTransmitida`: status `em_emissao` E sem `chave_acesso`;
 *  2. `autorizacaoPodeSubstituir`: chave diferente nunca substitui a gravada;
 *  3. `processarJob`: nota que já tem chave encerra o job sem ir à SEFAZ.
 */

function notaAutorizada(extra: Record<string, unknown> = {}) {
  return {
    id: "nota-1",
    organization_id: "org-1",
    order_id: "pedido-1",
    serie: "1",
    status: "em_emissao",
    provedor: "spednfe",
    numero: 4641,
    chave_acesso: "42261135233142000183550010000046411361083248",
    created_at: "2026-11-16T18:40:00.000Z",
    extras_fiscais: null,
    ...extra,
  };
}

/**
 * Admin falso mínimo para o caminho de guarda: o claim do job e a leitura da
 * nota. `processarJob` retorna antes de qualquer consulta de configuração.
 */
function adminFalso(nota: Record<string, unknown> | null): SupabaseClient {
  const encadeavel = (tabela: string) => {
    let acao = "select";
    const alvo = {
      update: () => {
        acao = "update";
        return alvo;
      },
      select: () => alvo,
      eq: () => alvo,
      maybeSingle: async () => ({ data: nota, error: null }),
      then: (ok: (v: unknown) => unknown) =>
        Promise.resolve({
          data: acao === "update" && tabela === "fiscal_jobs" ? [{ id: "job-1" }] : null,
          error: null,
        }).then(ok),
    };
    return alvo;
  };
  return { from: (tabela: string) => encadeavel(tabela) } as unknown as SupabaseClient;
}

describe("notaPodeSerTransmitida", () => {
  it("nota em emissão e sem chave pode ir para a SEFAZ", () => {
    expect(notaPodeSerTransmitida({ status: "em_emissao", chave_acesso: null })).toBe(true);
  });

  it("nota com chave já está autorizada — não se transmite de novo", () => {
    expect(
      notaPodeSerTransmitida({ status: "em_emissao", chave_acesso: notaAutorizada().chave_acesso }),
    ).toBe(false);
  });

  it("status terminal também barra", () => {
    for (const status of ["autorizada", "denegada", "cancelada", "erro", "pendente"]) {
      expect(notaPodeSerTransmitida({ status, chave_acesso: null })).toBe(false);
    }
    expect(notaPodeSerTransmitida(null)).toBe(false);
  });
});

describe("autorizacaoPodeSubstituir", () => {
  it("linha sem chave aceita a primeira autorização", () => {
    expect(autorizacaoPodeSubstituir({ chave_acesso: null }, "chave-1")).toBe(true);
  });

  it("a MESMA chave pode ser regravada (replay da resposta)", () => {
    expect(autorizacaoPodeSubstituir({ chave_acesso: "chave-1" }, "chave-1")).toBe(true);
  });

  it("chave diferente não substitui a autorização gravada", () => {
    expect(autorizacaoPodeSubstituir({ chave_acesso: "chave-4641" }, "chave-4642")).toBe(false);
  });

  it("resultado sem chave não é autorização", () => {
    expect(autorizacaoPodeSubstituir({ chave_acesso: "chave-1" }, null)).toBe(true);
  });
});

describe("processarJob", () => {
  it("job de nota já autorizada encerra sem transmitir", async () => {
    const r = await processarJob(adminFalso(notaAutorizada()), {
      id: "job-1",
      organization_id: "org-1",
      invoice_id: "nota-1",
      tentativas: 0,
      max_tentativas: 5,
    });

    expect(r).toEqual({ saidas: "ignorado", motivo: "nota fora de emissão" });
  });

  it("job de nota cancelada também é ignorado", async () => {
    const r = await processarJob(adminFalso(notaAutorizada({ status: "cancelada", chave_acesso: null })), {
      id: "job-1",
      organization_id: "org-1",
      invoice_id: "nota-1",
      tentativas: 0,
      max_tentativas: 5,
    });

    expect(r).toEqual({ saidas: "ignorado", motivo: "nota fora de emissão" });
  });
});

describe("pedido vira faturado quando a nota é autorizada", () => {
  it("só o aprovado avança — os demais não regridem", () => {
    expect(pedidoViraFaturado("aprovado")).toBe(true);
    for (const status of [
      "rascunho",
      "em_analise",
      "concluido",
      "faturado",
      "expedido",
      "entregue",
      "cancelado",
    ]) {
      expect(pedidoViraFaturado(status), status).toBe(false);
    }
  });
});

describe("faturarPedidosDaNota", () => {
  it("atualiza só pedido aprovado para faturado e audita a origem", async () => {
    const escritas: { tabela: string; valores: Record<string, unknown>; filtros: [string, unknown][] }[] = [];
    const admin = {
      from: (tabela: string) => {
        const op = { tabela, valores: {} as Record<string, unknown>, filtros: [] as [string, unknown][] };
        const alvo = {
          select: () => alvo,
          update: (valores: Record<string, unknown>) => {
            op.valores = valores;
            return alvo;
          },
          eq: (coluna: string, valor: unknown) => {
            op.filtros.push([coluna, valor]);
            return alvo;
          },
          in: (coluna: string, valor: unknown) => {
            op.filtros.push([`in:${coluna}`, valor]);
            return alvo;
          },
          then: (ok: (v: unknown) => unknown) => {
            escritas.push(op);
            const data =
              tabela === "invoice_orders"
                ? [{ order_id: "pedido-1" }]
                : [{ id: "pedido-1", numero: 19631 }];
            return Promise.resolve({ data, error: null }).then(ok);
          },
        };
        return alvo;
      },
    } as unknown as SupabaseClient;

    await faturarPedidosDaNota(admin, {
      id: "nota-1",
      organization_id: "org-1",
      order_id: "pedido-1",
      serie: "1",
      numero: 4642,
    });

    const update = escritas.find((e) => e.tabela === "commercial_orders");
    expect(update?.valores.status).toBe("faturado");
    expect(update?.filtros).toContainEqual(["status", "aprovado"]);
    expect(audit).toHaveBeenCalledTimes(1);
    expect(vi.mocked(audit).mock.calls[0]?.[0]).toMatchObject({
      action: "commercial_order.updated",
      resourceId: "pedido-1",
      metadata: { status_anterior: "aprovado", origem: "nfe_autorizada", nota_numero: 4642 },
    });
  });
});

describe("gerarRecebiveisDaNotaAutorizada (D1)", () => {
  function adminDe(
    pedidos: Record<string, unknown>[],
    opcoes: { erroPedidos?: boolean; vinculos?: { order_id: string }[] } = {},
  ) {
    const consultas: string[] = [];
    const client = {
      from: (tabela: string) => {
        consultas.push(tabela);
        const q: Record<string, unknown> = {};
        for (const nome of ["select", "eq", "in"]) q[nome] = () => q;
        q.then = (ok: (v: unknown) => unknown) => {
          if (tabela === "invoice_orders") {
            return Promise.resolve({
              data: opcoes.vinculos ?? [{ order_id: "pedido-1" }],
              error: null,
            }).then(ok);
          }
          if (tabela === "commercial_orders") {
            return Promise.resolve(
              opcoes.erroPedidos
                ? { data: null, error: { message: "leitura falhou" } }
                : { data: pedidos, error: null },
            ).then(ok);
          }
          return Promise.resolve({ data: null, error: null }).then(ok);
        };
        return q;
      },
    };
    return { client: client as unknown as SupabaseClient, consultas };
  }

  const nota = {
    id: "nota-1",
    organization_id: "org-1",
    order_id: "pedido-1",
    serie: "1",
    numero: 4642,
  };

  const pedido = {
    id: "pedido-1",
    numero: 19631,
    contact_id: "contato-1",
    total_cents: 100000,
    condicao_pagamento: "30/60",
    created_at: "2026-11-01T10:00:00.000Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gera pelo mesmo gerador do PATCH e audita a origem nfe_autorizada", async () => {
    vi.mocked(gerarRecebiveis).mockResolvedValue({
      criados: 2,
      existentes: 0,
      ids: ["rec-1", "rec-2"],
    });
    const { client } = adminDe([pedido]);

    const r = await gerarRecebiveisDaNotaAutorizada(client, nota);

    expect(r).toEqual({ pedidos: 1, criados: 2 });
    expect(gerarRecebiveis).toHaveBeenCalledWith(client, {
      orgId: "org-1",
      orderId: "pedido-1",
      contactId: "contato-1",
      totalCents: 100000,
      condicao: "30/60",
      baseIso: "2026-11-01T10:00:00.000Z",
      criadoPor: null,
    });
    expect(audit).toHaveBeenCalledTimes(1);
    expect(vi.mocked(audit).mock.calls[0]?.[0]).toMatchObject({
      action: "financial_receivable.generated",
      resourceId: "pedido-1",
      metadata: {
        origem: "nfe_autorizada",
        invoice_id: "nota-1",
        nota_numero: 4642,
        criados: 2,
      },
    });
  });

  it("retry com recebíveis já existentes não cria nem audita de novo", async () => {
    vi.mocked(gerarRecebiveis).mockResolvedValue({
      criados: 0,
      existentes: 2,
      ids: [],
    });
    const { client } = adminDe([pedido]);

    const r = await gerarRecebiveisDaNotaAutorizada(client, nota);

    expect(r).toEqual({ pedidos: 1, criados: 0 });
    expect(audit).not.toHaveBeenCalled();
  });

  it("nota agrupada gera para os pedidos secundários também", async () => {
    vi.mocked(gerarRecebiveis).mockResolvedValue({ criados: 1, existentes: 0, ids: ["rec-2"] });
    const { client } = adminDe([{ ...pedido, id: "pedido-2", numero: 2 }], {
      vinculos: [{ order_id: "pedido-1" }, { order_id: "pedido-2" }],
    });

    const r = await gerarRecebiveisDaNotaAutorizada(client, nota);

    expect(r).toEqual({ pedidos: 1, criados: 1 });
    expect(vi.mocked(gerarRecebiveis).mock.calls[0]?.[1]).toMatchObject({ orderId: "pedido-2" });
  });

  it("falha de um pedido não derruba os outros nem lança (nota já é história fiscal)", async () => {
    vi.mocked(gerarRecebiveis)
      .mockRejectedValueOnce(new Error("insert falhou"))
      .mockResolvedValueOnce({ criados: 1, existentes: 0, ids: ["rec-2"] });
    const { client } = adminDe([
      { ...pedido, id: "pedido-1" },
      { ...pedido, id: "pedido-2", numero: 2 },
    ], {
      vinculos: [{ order_id: "pedido-1" }, { order_id: "pedido-2" }],
    });

    const r = await gerarRecebiveisDaNotaAutorizada(client, nota);

    expect(r).toEqual({ pedidos: 2, criados: 1 });
    expect(gerarRecebiveis).toHaveBeenCalledTimes(2);
  });

  it("falha de leitura dos pedidos devolve zero sem lançar", async () => {
    const { client } = adminDe([], { erroPedidos: true });
    const r = await gerarRecebiveisDaNotaAutorizada(client, nota);
    expect(r).toEqual({ pedidos: 0, criados: 0 });
    expect(gerarRecebiveis).not.toHaveBeenCalled();
  });
});
