import { describe, expect, it, vi } from "vitest";

// O vendedor do pedido importado não é usuário do CRM: o teste não pode
// depender de SERVICE_ROLE nem de rede para provar o fallback.
vi.mock("@/lib/audit", () => ({ isServiceRoleConfigured: () => false }));

import { montarPedidosPdf } from "@/lib/comercial/montar-pedidos";

/**
 * A PONTE ENTRE O BANCO E O IMPRESSO.
 *
 * O PDF só sai igual ao Mercos se ESTA montagem entregar os campos como o
 * Mercos os tem — e é aqui que os dados legados do importador precisam ser
 * desmontados: `display_name` com a fantasia colada na frente, `logradouro`
 * com o endereço inteiro, cidade com o estado no fim, observação interna no
 * lugar da observação do cliente.
 */

function fakeSupabase(dados: Record<string, unknown[]>) {
  const cliente = {
    from(tabela: string) {
      const construtor: Record<string, unknown> = {};
      const cadeia = () => construtor;
      construtor.select = cadeia;
      construtor.eq = cadeia;
      construtor.in = cadeia;
      construtor.order = cadeia;
      construtor.then = (ok: (v: unknown) => unknown) =>
        ok({ data: dados[tabela] ?? [], error: null });
      return construtor;
    },
  };
  return cliente as never;
}

function pedidoCru(over: Record<string, unknown> = {}) {
  return {
    id: "p1",
    numero: 19513,
    status: "aprovado",
    subtotal_cents: 12000,
    desconto_cents: 0,
    frete_cents: 0,
    total_cents: 12000,
    condicao_pagamento: "AVISTA",
    observacoes: "Status Mercos: Concluído",
    mercos_observacoes: "compras simone",
    endereco_entrega: null,
    created_at: "2026-11-10T12:00:00Z",
    cliente_nome: "MARMORARIA GLORIA LTDA",
    cliente_documento: "85.168.318/0001-39",
    contact_id: "c1",
    vendedor_user_id: null,
    vendedor_nome: "VENDEDOR JB",
    origem: "mercos",
    ...over,
  };
}

const CONTATO = {
  id: "c1",
  display_name: "MARMORARIA GLORIA - MARMORARIA GLORIA LTDA",
  name: "MARMORARIA GLORIA - MARMORARIA GLORIA LTDA",
  tipo_pessoa: "PJ",
  fantasia: "MARMORARIA GLORIA",
  ie: "252282272",
  cnpj: "85168318000139",
  source_metadata: null,
  phone_number: "+5542999258697",
  email: null,
  logradouro: "RUA MATOS COSTA, 502, ********",
  numero_end: "502",
  complemento: "",
  bairro: "CENTRO",
  cidade: "Porto União, Santa Catarina",
  uf: "SC",
  cep: "89400000",
};

function montar(pedido: Record<string, unknown>, contato: unknown = CONTATO) {
  return montarPedidosPdf(
    fakeSupabase({
      commercial_orders: [pedido],
      commercial_order_items: [],
      contacts: contato ? [contato] : [],
      catalog_products: [],
    }),
    "org-1",
    ["p1"],
  );
}

describe("montarPedidosPdf — o bloco do cliente do impresso", () => {
  it("[DISCRIMINA] desmonta o cadastro do Mercos nos campos do papel", async () => {
    const [p] = await montar(pedidoCru());
    expect(p!.cliente.nome).toBe("MARMORARIA GLORIA LTDA");
    // "Endereço" é só a rua; bairro/cidade/CEP/UF têm linha própria.
    expect(p!.cliente.endereco).toBe("RUA MATOS COSTA 502 ********");
    expect(p!.cliente.cidade).toBe("Porto União");
    expect(p!.cliente.bairro).toBe("CENTRO");
    expect(p!.cliente.cep).toBe("89400000");
    expect(p!.cliente.documento).toBe("85168318000139");
    expect(p!.cliente.ie).toBe("252282272");
  });

  it("a observação impressa é a do Mercos; a interna fica de fora", async () => {
    const [mercos] = await montar(pedidoCru());
    expect(mercos!.observacoes).toBe("compras simone");

    // Pedido do Mercos SEM observação do cliente: o lixo interno não sobe
    // para o papel (o bloco some no render).
    const [sem] = await montar(pedidoCru({ mercos_observacoes: null }));
    expect(sem!.observacoes).toBeNull();
  });

  it("pedido criado no CRM imprime a própria observação", async () => {
    const [crm] = await montar(
      pedidoCru({
        origem: "manual",
        observacoes: "Entregar pela manhã",
        mercos_observacoes: null,
      }),
    );
    expect(crm!.observacoes).toBe("Entregar pela manhã");
  });

  it("o vendedor importado aparece quando não há usuário do CRM", async () => {
    const [p] = await montar(pedidoCru());
    expect(p!.vendedor_nome).toBe("VENDEDOR JB");
  });

  it("sem cadastro, cai no snapshot do pedido — nunca vazio", async () => {
    const [p] = await montar(pedidoCru({ endereco_entrega: "RUA X, 10 — Centro" }), null);
    expect(p!.cliente.nome).toBe("MARMORARIA GLORIA LTDA");
    expect(p!.cliente.endereco).toBe("RUA X, 10 — Centro");
    expect(p!.cliente.cidade).toBeNull();
  });
});
