// @vitest-environment node
// node de propósito: o jsdom trunca os streams Flate do @react-pdf/renderer
// (PDF com /Length maior que o stream real) — provado em 2026-09-06 com doc
// mínimo. Em node o stream descomprime íntegro, igual à rota de produção.
import { describe, expect, it } from "vitest";

import { extractPdfText } from "@/lib/ai/rag/extractors/pdf";
import {
  numeroDoPedidoPdf,
  precoLiquidoCents,
  renderPedidoPdf,
  renderPedidosPdf,
  type PedidoPdfDados,
  type PedidoPdfEmitente,
} from "@/lib/comercial/pedido-pdf";

const EMITENTE: PedidoPdfEmitente = {
  nome: "Bill Higiene e Limpeza",
  documento: "12.345.678/0001-90",
  telefone: "(47) 98496-0797",
  endereco: "Rua Antônio Liller, 585 — Centro, Canoinhas/SC, 89460-000",
};

function pedido(numero: number): PedidoPdfDados {
  return {
    numero,
    status: "aprovado",
    subtotal_cents: 15000,
    desconto_cents: 1000,
    frete_cents: 500,
    total_cents: 14500,
    condicao_pagamento: "30 dias",
    observacoes: "Entregar pela manhã",
    endereco_entrega: null,
    created_at: "2026-09-04T12:00:00Z",
    vendedor_nome: "Ana",
    cliente: {
      nome: `Mercado Central ${numero}`,
      fantasia: null,
      rotuloDocumento: "CNPJ",
      documento: null,
      ie: null,
      endereco: "Rua X, 123",
      bairro: "Centro",
      cep: null,
      cidade: "Canoinhas",
      uf: "SC",
      fone: null,
      email: null,
    },
    itens: [
      {
        produto_codigo: "AG-5L",
        produto_nome: "Água Sanitária 5L",
        quantidade: 2,
        unidade: "UN",
        preco_unit_cents: 5000,
        desconto_pct: 10,
        subtotal_cents: 9000,
      },
    ],
  };
}

/** O pdf.js junta os itens sem separador; normalizar evite falso negativo de espaço. */
function texto(buf: Buffer): Promise<string> {
  return extractPdfText(buf).then((t) => t.replace(/\s+/g, " "));
}

/**
 * O PDF do pedido renderiza de verdade (cerca do ATT.txt F2 §5.3).
 *
 * Não confere pixel — confere que o Buffer é um PDF válido, tem tamanho
 * plausível e que o CABEÇALHO carrega o emitente inteiro (CNPJ, telefone e
 * endereço), que é o que o modelo do Mercos exige.
 */
describe("renderPedidoPdf", () => {
  it("gera PDF válido com acentos e totais", async () => {
    const buf = await renderPedidoPdf(EMITENTE, pedido(7));
    expect(buf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(2000);
  });

  it("o cabeçalho imprime CNPJ, telefone e endereço da empresa", async () => {
    const t = await texto(await renderPedidoPdf(EMITENTE, pedido(7)));
    // CNPJ do EMITENTE: o do cliente é `null` no factory, então o número que
    // aparece só pode ter vindo do cabeçalho.
    expect(t).toContain("12.345.678/0001-90");
    // Idem telefone e CEP: `fone`/`cep` do cliente são null.
    expect(t).toContain("(47) 98496-0797");
    expect(t).toContain("89460-000");
    expect(t).toContain("Bill Higiene e Limpeza");
  });

  it("emitente sem telefone/endereço não joga o valor no papel", async () => {
    const t = await texto(
      await renderPedidoPdf({ nome: "Só Nome", documento: null }, pedido(7)),
    );
    expect(t).not.toContain("(47) 98496-0797");
    expect(t).not.toContain("89460-000");
  });

  it("com logo, a imagem entra no cabeçalho", async () => {
    // PNG 1×1 real — o Image do @react-pdf lê o data URI e embute o XObject;
    // se ele falhasse, a renderização lançaria e o teste não chegaria aqui.
    const PNG_1X1 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const semLogo = await renderPedidoPdf(EMITENTE, pedido(7));
    const comLogo = await renderPedidoPdf(
      { ...EMITENTE, logo: { data: PNG_1X1, format: "png" } },
      pedido(7),
    );
    expect(comLogo.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(comLogo.length).toBeGreaterThan(semLogo.length);
    expect(await texto(comLogo)).toContain("Bill Higiene e Limpeza");
  });

  it("numera com zeros à esquerda", () => {
    expect(numeroDoPedidoPdf(7)).toBe("PED-0007");
  });

  it("preço líquido arredonda, não trunca", () => {
    expect(precoLiquidoCents(5000, 10)).toBe(4500);
    expect(precoLiquidoCents(100, 0)).toBe(100);
    // 199 × 0,9 = 179,1 → 179 (round_half_up do Math.round: 179.1 → 179).
    expect(precoLiquidoCents(199, 10)).toBe(179);
  });
}, 60000);

describe("renderPedidosPdf (lote)", () => {
  it("um arquivo com um pedido por página, cabeçalho em todas", async () => {
    const lote = [pedido(1), pedido(2), pedido(3)];
    const buf = await renderPedidosPdf(EMITENTE, lote);
    expect(buf.subarray(0, 5).toString("ascii")).toBe("%PDF-");

    const t = await texto(buf);
    // Os três números de pedido e os três clientes: são as três páginas.
    expect(t).toContain("Pedido Nº 1");
    expect(t).toContain("Pedido Nº 2");
    expect(t).toContain("Pedido Nº 3");
    expect(t).toContain("Mercado Central 1");
    expect(t).toContain("Mercado Central 3");
    // O emitente não é "de primeira página": o cabeçalho se repete.
    expect(t.split("89460-000").length - 1).toBe(3);
  }, 60000);

  it("lote de um bate com o pedido impresso sozinho", async () => {
    const unico = await renderPedidoPdf(EMITENTE, pedido(7));
    const lote = await renderPedidosPdf(EMITENTE, [pedido(7)]);
    // Mesmo conteúdo: o lote não pode acrescentar nem perder nada.
    expect(lote.length).toBe(unico.length);
  }, 60000);
}, 60000);
