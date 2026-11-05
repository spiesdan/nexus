import { describe, expect, it } from "vitest";

import { ajusteDaNotaSchema, extrasFiscaisSchema } from "@/lib/schemas/fiscal";

import {
  aplicarAjusteNosItens,
  descreverAjuste,
  notaEditavel,
  type ItemDaNota,
} from "./ajustes-da-nota";
import { montarDestinatario, type ContatoFiscal } from "./destinatario-da-nota";

/**
 * A CORREÇÃO DA NOTA REJEITADA.
 *
 * Medido em 05/11/2026, em produção: a nota 4583 parou com `SEFAZ_232` — IE do
 * destinatário não informada — e não havia, na tela onde o erro aparecia,
 * nenhum jeito de preencher a IE. Estas invariantes são o que impede a correção
 * de virar (a) um ajuste que o drain ignora ou (b) uma edição que reescreve o
 * cadastro inteiro do cliente.
 */

const OUT_SERVICE: ContatoFiscal = {
  id: "5849b60d-636d-43e6-af4d-edc5dcb7f346",
  name: "EMERSON LETCHACOSKI LIMITADA",
  display_name: "EMERSON LETCHACOSKI LIMITADA",
  cnpj: "72228653000133",
  tipo_pessoa: "J",
  ie: null,
  logradouro: "RUA DANIEL MOREIRA, 317",
  numero_end: "317",
  bairro: "STROPARO",
  cidade: "IRATI",
  uf: "PR",
  cep: "84500000",
};

const PEDIDO = {
  cliente_nome: "OUT SERVICE - EMERSON LETCHACOSKI LIMITADA",
  cliente_documento: "72.228.653/0001-33",
  contact_id: OUT_SERVICE.id,
};

describe("montarDestinatario com ajuste da nota", () => {
  it("a IE digitada na correção vira contribuinte (1) e vai no XML", () => {
    const base = montarDestinatario(PEDIDO, OUT_SERVICE);
    // Sem IE no cadastro, a nota sai como não contribuinte — e a SEFAZ recusa
    // com 232 quando o CNPJ tem IE ativa na UF.
    expect(base).toMatchObject({ ie: null, indicador_ie: "9" });

    const corrigido = montarDestinatario(PEDIDO, OUT_SERVICE, { ie: "2170258692" });
    expect(corrigido.ie).toBe("2170258692");
    expect(corrigido.indicador_ie).toBe("1");
  });

  it("IE com máscara é normalizada; 'ISENTO' vira 2; vazio volta para 9", () => {
    expect(
      montarDestinatario(PEDIDO, OUT_SERVICE, { ie: "90176799-85" }).ie,
    ).toBe("9017679985");
    expect(montarDestinatario(PEDIDO, OUT_SERVICE, { ie: "ISENTO" })).toMatchObject({
      ie: null,
      indicador_ie: "2",
    });
    expect(montarDestinatario(PEDIDO, OUT_SERVICE, { ie: "" })).toMatchObject({
      ie: null,
      indicador_ie: "9",
    });
  });

  it("o ajuste é cirúrgico: corrigir a IE não apaga o endereço do cadastro", () => {
    const d = montarDestinatario(PEDIDO, OUT_SERVICE, { ie: "2170258692" });
    expect(d.entrega).toMatchObject({
      logradouro: "RUA DANIEL MOREIRA, 317",
      numero: "317",
      bairro: "STROPARO",
      municipio: "Irati",
      uf: "PR",
    });
    expect(d.faltando).toEqual([]);
  });

  it("endereço corrigido na nota vence o cadastro e resolve o IBGE de novo", () => {
    const d = montarDestinatario(PEDIDO, OUT_SERVICE, {
      logradouro: "AVENIDA VICENTE MACHADO",
      numero: "1200",
      bairro: "CENTRO",
      cidade: "Curitiba",
      uf: "PR",
      cep: "80010000",
    });
    expect(d.entrega).toMatchObject({
      logradouro: "AVENIDA VICENTE MACHADO",
      numero: "1200",
      municipio: "Curitiba",
      codigo_municipio: "4106902",
      cep: "80010000",
    });
  });

  it("documento digitado na nota entra no lugar do cadastro", () => {
    const semDoc: ContatoFiscal = { ...OUT_SERVICE, cnpj: null };
    expect(montarDestinatario(PEDIDO, semDoc).documento).toBe("72228653000133");
    const d = montarDestinatario(PEDIDO, semDoc, { documento: "02955426000205" });
    expect(d.documento).toBe("02955426000205");
  });

  it("endereço pela metade continua nomeado em `faltando` — não vira TLocal truncado", () => {
    const d = montarDestinatario(PEDIDO, OUT_SERVICE, { numero: "" });
    expect(d.entrega).toBeNull();
    expect(d.faltando).toContain("número do endereço");
  });
});

describe("aplicarAjusteNosItens", () => {
  const itens: ItemDaNota[] = [
    {
      order_item_id: "11111111-1111-4111-8111-111111111111",
      codigo: "EST-001",
      descricao: "ESTOPA BRANCA",
      ncm: null,
      cfop: "5102",
      unidade: "KG",
      quantidade: 10,
      preco_cents: 1250,
      desconto_pct: 0,
    },
    {
      order_item_id: "22222222-2222-4222-8222-222222222222",
      codigo: "EST-002",
      descricao: "ESTOPA COLORIDA",
      ncm: "56012110",
      cfop: "5102",
      unidade: "KG",
      quantidade: 5,
      preco_cents: 900,
      desconto_pct: 10,
    },
  ];

  it("casa por `order_item_id` — corrigir um item não mexe no vizinho", () => {
    const saida = aplicarAjusteNosItens(itens, [
      { order_item_id: itens[0]!.order_item_id, ncm: "56012110" },
    ]);
    expect(saida[0]!.ncm).toBe("56012110");
    expect(saida[1]).toEqual(itens[1]);
    // O que não foi ajustado permanece: a correção não apaga CFOP nem unidade.
    expect(saida[0]!.cfop).toBe("5102");
    expect(saida[0]!.descricao).toBe("ESTOPA BRANCA");
  });

  it("sem ajuste, devolve a mesma lista — nota sem correção não muda", () => {
    expect(aplicarAjusteNosItens(itens, null)).toBe(itens);
    expect(aplicarAjusteNosItens(itens, [])).toBe(itens);
  });

  it("item que sumiu do pedido não é recriado pelo ajuste", () => {
    const saida = aplicarAjusteNosItens(itens, [
      { order_item_id: "33333333-3333-4333-8333-333333333333", ncm: "56012110" },
    ]);
    expect(saida).toHaveLength(2);
    expect(saida.map((i) => i.ncm)).toEqual([null, "56012110"]);
  });
});

describe("ajusteDaNotaSchema", () => {
  it("recusa NCM que não tem 8 dígitos, CFOP que não tem 4 e documento inválido", () => {
    const base = { itens: [], aplicar_no_cadastro: true, reenviar: false };
    expect(
      ajusteDaNotaSchema.safeParse({
        ...base,
        itens: [{ order_item_id: "11111111-1111-4111-8111-111111111111", ncm: "5601" }],
      }).success,
    ).toBe(false);
    expect(
      ajusteDaNotaSchema.safeParse({
        ...base,
        itens: [{ order_item_id: "11111111-1111-4111-8111-111111111111", cfop: "51" }],
      }).success,
    ).toBe(false);
    expect(
      ajusteDaNotaSchema.safeParse({ ...base, destinatario: { documento: "123" } }).success,
    ).toBe(false);
  });

  it("recusa corpo sem nada para corrigir", () => {
    expect(ajusteDaNotaSchema.safeParse({}).success).toBe(false);
    expect(
      ajusteDaNotaSchema.safeParse({
        itens: [],
        aplicar_no_cadastro: true,
        reenviar: false,
      }).success,
    ).toBe(false);
  });

  it("aceita a correção mínima do caso real (só a IE) e assume os defaults", () => {
    const r = ajusteDaNotaSchema.parse({ destinatario: { ie: "2170258692" } });
    expect(r.destinatario?.ie).toBe("2170258692");
    expect(r.aplicar_no_cadastro).toBe(true);
    expect(r.reenviar).toBe(false);
  });
});

describe("extrasFiscaisSchema", () => {
  it("carrega o ajuste da nota sem perder os grupos que já existiam", () => {
    const r = extrasFiscaisSchema.parse({
      adicionais: { informacoes_complementares: "Pedido 19441" },
      destinatario: { ie: "2170258692" },
      itens: [{ order_item_id: "11111111-1111-4111-8111-111111111111", ncm: "56012110" }],
    });
    expect(r.adicionais?.informacoes_complementares).toBe("Pedido 19441");
    expect(r.destinatario?.ie).toBe("2170258692");
    expect(r.itens?.[0]?.ncm).toBe("56012110");
  });
});

describe("notaEditavel", () => {
  it("corrige nota que ainda não saiu; autorizada é história fiscal", () => {
    expect(notaEditavel("erro")).toBe(true);
    expect(notaEditavel("pendente")).toBe(true);
    // Em transmissão: a SEFAZ pode estar com este documento agora.
    expect(notaEditavel("em_emissao")).toBe(false);
    expect(notaEditavel("autorizada")).toBe(false);
    expect(notaEditavel("denegada")).toBe(false);
    expect(notaEditavel("cancelada")).toBe(false);
  });
});

describe("descreverAjuste", () => {
  it("nomeia o que mudou — a timeline não pode dizer só 'ajustes salvos'", () => {
    const texto = descreverAjuste({
      destinatario: { ie: "2170258692" },
      itens: [{ order_item_id: "11111111-1111-4111-8111-111111111111", ncm: "56012110" }],
      adicionais: { informacoes_complementares: "Pedido 19441" },
      aplicar_no_cadastro: true,
      reenviar: false,
    });
    expect(texto).toContain("destinatário: IE");
    expect(texto).toContain("1 item: NCM");
    expect(texto).toContain("informações complementares");
  });
});
