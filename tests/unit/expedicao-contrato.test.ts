// @vitest-environment node
// node de propósito: mesmo motivo do pedido-pdf.test.ts (streams Flate
// íntegros fora do jsdom).
import { describe, expect, it } from "vitest";

import {
  cargaCreateSchema,
  MOTIVOS_DEVOLUCAO,
  numeroDaCarga,
  ROTULO_DA_CARGA,
  ROTULO_MOTIVO_DEVOLUCAO,
  ROTULO_NA_CARGA,
  STATUS_DA_CARGA,
  STATUS_EMBARCAVEIS,
  STATUS_NA_CARGA,
} from "@/lib/schemas/expedicao";
import {
  agruparItensRepetidos,
  agruparParadasPorCidade,
  ordenarParadasDoRomaneio,
  renderRomaneioPdf,
  totaisPorCondicaoDePagamento,
} from "@/lib/comercial/romaneio-pdf";
import { numeroDoPedidoPdf } from "@/lib/comercial/pedido-pdf";

/**
 * O CONTRATO DA EXPEDIÇÃO — cerca do ATT.txt Fase 3.
 */
describe("totaisPorCondicaoDePagamento", () => {
  const parada = (numero: number, condicao: string | null, cents: number) => ({
    sequencia: numero,
    numero,
    cliente_nome: `CLIENTE ${numero}`,
    endereco_entrega: null,
    total_cents: cents,
    status: "na_carga",
    condicao_pagamento: condicao,
  });

  it("agrupa caixa/acento/espaço: 'BOLETO 14 DIAS' e 'Boleto 14 dias' são o mesmo meio", () => {
    const totais = totaisPorCondicaoDePagamento([
      parada(1, "BOLETO 14 DIAS", 10000),
      parada(2, "Boleto  14 dias", 25000),
      parada(3, "PIX", 5000),
    ]);
    expect(totais).toEqual([
      { rotulo: "BOLETO 14 DIAS", pedidos: 2, totalCents: 35000 },
      { rotulo: "PIX", pedidos: 1, totalCents: 5000 },
    ]);
  });

  it("pedido sem condição entra em 'Não informado' — a soma tem de fechar", () => {
    const paradas = [parada(1, "AVISTA", 7000), parada(2, null, 3000), parada(3, "  ", 1000)];
    const totais = totaisPorCondicaoDePagamento(paradas);
    const semPagamento = totais.find((t) => t.rotulo === "Não informado");
    expect(semPagamento).toEqual({ rotulo: "Não informado", pedidos: 2, totalCents: 4000 });
    const soma = totais.reduce((s, t) => s + t.totalCents, 0);
    const totalDaCarga = paradas.reduce((s, p) => s + p.total_cents, 0);
    expect(soma).toBe(totalDaCarga);
  });

  it("carga vazia devolve lista vazia", () => {
    expect(totaisPorCondicaoDePagamento([])).toEqual([]);
  });
});

describe("cargaCreateSchema", () => {
  it("aceita carga vazia (só monta, sem pedidos)", () => {
    const r = cargaCreateSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("normaliza placa (minúscula + hífen)", () => {
    const r = cargaCreateSchema.safeParse({ placa: "abc-1d23" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.placa).toBe("ABC1D23");
  });

  it("recusa placa fora do padrão", () => {
    expect(cargaCreateSchema.safeParse({ placa: "XYZ" }).success).toBe(false);
  });
});

describe("embarque", () => {
  it("aprovado, concluído e faturado embarcam — em_analise precisa aprovar antes", () => {
    expect((STATUS_EMBARCAVEIS as readonly string[]).includes("rascunho")).toBe(false);
    expect((STATUS_EMBARCAVEIS as readonly string[]).includes("em_analise")).toBe(false);
    expect((STATUS_EMBARCAVEIS as readonly string[]).includes("aprovado")).toBe(true);
    // Concluído = venda fechada no ERP sem nota; antes da 0302 esse pedido
    // chegava como `faturado`, e é por isso que ele já embarcava.
    expect((STATUS_EMBARCAVEIS as readonly string[]).includes("concluido")).toBe(true);
    expect((STATUS_EMBARCAVEIS as readonly string[]).includes("faturado")).toBe(true);
    expect((STATUS_EMBARCAVEIS as readonly string[]).includes("expedido")).toBe(false);
    expect((STATUS_EMBARCAVEIS as readonly string[]).includes("entregue")).toBe(false);
    expect((STATUS_EMBARCAVEIS as readonly string[]).includes("cancelado")).toBe(false);
  });

  it("todo status tem rótulo", () => {
    for (const s of STATUS_DA_CARGA) expect(ROTULO_DA_CARGA[s]).toBeTruthy();
    for (const s of STATUS_NA_CARGA) expect(ROTULO_NA_CARGA[s]).toBeTruthy();
  });

  it("cheguei não é entregue, e devolvido tem motivo com rótulo", () => {
    expect((STATUS_NA_CARGA as readonly string[])).toContain("em_atendimento");
    for (const m of MOTIVOS_DEVOLUCAO) expect(ROTULO_MOTIVO_DEVOLUCAO[m]).toBeTruthy();
  });

  it("romaneio sai em ordem de entrega mesmo com entrada embaralhada", () => {
    const mk = (sequencia: number, numero: number) => ({
      sequencia,
      numero,
      cliente_nome: "C",
      endereco_entrega: null,
      total_cents: 100,
      status: "na_carga",
    });
    const ordem = ordenarParadasDoRomaneio([mk(3, 30), mk(1, 10), mk(2, 20), mk(2, 15)]).map((p) => p.numero);
    expect(ordem).toEqual([10, 15, 20, 30]);
  });

  it("repetidos: mesmo produto em 2 pedidos soma uma vez só", () => {
    const mk = (numero: number, itens: { codigo: string; nome: string; quantidade: number }[]) => ({
      sequencia: 1,
      numero,
      cliente_nome: "C",
      endereco_entrega: null,
      total_cents: 100,
      status: "na_carga",
      itens,
    });
    const grupos = agruparItensRepetidos([
      mk(101, [{ codigo: "114", nome: "ESTOPA 20KG", quantidade: 1 }]),
      mk(102, [
        { codigo: "114", nome: "ESTOPA 20KG", quantidade: 1 },
        { codigo: "79", nome: "DETERGENTE 5L", quantidade: 2 },
      ]),
      mk(103, [{ codigo: "", nome: "estopa  20kg", quantidade: 3 }]),
    ]);
    // 114 em dois pedidos (1+1) + sem-código que é a mesma estopa (3).
    expect(grupos).toHaveLength(1);
    expect(grupos[0]).toMatchObject({ codigo: "114", quantidade_total: 5, pedidos: [101, 102, 103] });
    // Item de um pedido só não entra.
    expect(grupos.some((g) => g.nome === "DETERGENTE 5L")).toBe(false);
  });

  it("numera com zeros", () => {
    expect(numeroDaCarga(3)).toBe("Carga 003");
    expect(numeroDoPedidoPdf(7)).toBe("PED-0007");
  });
});

describe("agruparParadasPorCidade", () => {
  const parada = (sequencia: number, cidade: string | null) => ({
    sequencia,
    numero: 19000 + sequencia,
    cliente_nome: `CLIENTE ${sequencia}`,
    endereco_entrega: null,
    total_cents: 1000,
    status: "na_carga",
    cidade,
  });

  it("separa por cidade mantendo a ordem da rota entre os grupos", () => {
    const grupos = agruparParadasPorCidade([
      parada(1, "MAFRA/SC"),
      parada(2, "CANOINHAS/SC"),
      parada(3, "Mafra/SC"),
      parada(4, "CANOINHAS/SC"),
    ]);
    expect(grupos.map((g) => g.rotulo)).toEqual(["MAFRA/SC", "CANOINHAS/SC"]);
    expect(grupos[0]!.paradas.map((p) => p.sequencia)).toEqual([1, 3]);
    expect(grupos[1]!.paradas.map((p) => p.sequencia)).toEqual([2, 4]);
  });

  it("Mafra e Mafra/SC são a mesma cidade, e o rótulo sobe para a forma com UF", () => {
    const grupos = agruparParadasPorCidade([
      parada(1, "Mafra"),
      parada(2, "MAFRA/SC"),
      parada(3, "Mafra, Santa Catarina"),
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]!.rotulo).toBe("MAFRA/SC");
    expect(grupos[0]!.paradas.map((p) => p.sequencia)).toEqual([1, 2, 3]);
  });

  it("cidade é comparada sem acento e sem caixa; o rótulo é o primeiro visto", () => {
    const grupos = agruparParadasPorCidade([parada(1, "São Bento do Sul/SC"), parada(2, "SAO BENTO DO SUL/SC")]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]!.rotulo).toBe("São Bento do Sul/SC");
  });

  it("parada sem cidade vai para o último grupo, com nome próprio", () => {
    const grupos = agruparParadasPorCidade([parada(1, null), parada(2, "MAFRA/SC")]);
    expect(grupos.map((g) => g.rotulo)).toEqual(["MAFRA/SC", "Cidade não informada"]);
    expect(grupos[1]!.paradas).toHaveLength(1);
  });
});

describe("renderRomaneioPdf", () => {
  it("gera PDF válido com paradas e assinatura", async () => {
    const buf = await renderRomaneioPdf(
      { nome: "Bill Higiene e Limpeza" },
      {
        numero: 2,
        placa: "ABC1D23",
        veiculo_tipo: "HR",
        motorista_nome: "José",
        paradas: [
          {
            sequencia: 1,
            numero: 10,
            cliente_nome: "Mercado Central",
            endereco_entrega: "Rua A, 123",
            total_cents: 5000,
            status: "na_carga",
          },
        ],
      },
    );
    expect(buf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(2000);
  });

  it("checklist por cliente: itens com quantidade para carregar na carga", async () => {
    const buf = await renderRomaneioPdf(
      { nome: "Bill Higiene e Limpeza" },
      {
        numero: 3,
        placa: null,
        veiculo_tipo: null,
        motorista_nome: null,
        paradas: [
          {
            sequencia: 1,
            numero: 11,
            cliente_nome: "Mercado Central",
            endereco_entrega: "Rua A, 123",
            total_cents: 22050,
            status: "na_carga",
            itens: [
              { codigo: "339", nome: "SACO DE LIXO PRETO 100L", quantidade: 3 },
              { codigo: "59", nome: "COPO DESCARTAVEL 180 ML", quantidade: 20 },
            ],
          },
        ],
      },
    );
    expect(buf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(2000);
  });

  /**
   * O ORÇAMENTO DE PÁGINAS — o defeito que este teste tranca.
   *
   * A carga 022 (22 paradas, 50 itens) saía em CINCO folhas: uma linha por
   * item mais um bloco de assinatura com respiro, por parada. Romaneio de
   * cinco páginas não é romaneio — o motorista confere na última enquanto
   * entrega. O dono pediu uma folha, no máximo duas.
   *
   * Conta páginas pelo marcador do PDF (não há parser de PDF entre as
   * dependências): `/Type /Page` aparece uma vez por folha. O teto é 2, não 1,
   * de propósito — uma carga maior tem que continuar cabendo sem virar
   * caderno, e o teste não deve quebrar a cada item novo.
   */
  it("carga grande (22 paradas, 50 itens) cabe em no máximo 2 páginas", async () => {
    const nomes = [
      "BILL COMERCIO DE ESTOPAS - PATRICIA DE FATIMA DA SILVA",
      "AUTO POSTO NOEROGER LTDA - EPP",
      "JZ COMERCIO DE MOVEIS E DECORACOES LTDA",
      "CRIATIVISIUM SERRALHERIA - MARCOS FABIO DE ALMEIDA",
    ];
    const cidades = [
      "MAFRA/SC",
      "CANOINHAS/SC",
      "CAMPO DO TENENTE/PR",
      "CURITIBANOS/SC",
      "RIO NEGRINHO/SC",
      "IRATI/PR",
    ];
    const qtds = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 3, 3, 3, 3, 5, 8, 8];
    let seq = 0;
    const paradas = qtds.map((quantos, i) => {
      const itens = Array.from({ length: quantos }, () => {
        seq += 1;
        return {
          codigo: String(seq),
          nome: `PRODUTO DE LIMPEZA E HIGIENE ${seq} 5L`,
          quantidade: 2,
        };
      });
      return {
        sequencia: i + 1,
        numero: 19000 + i,
        cliente_nome: nomes[i % nomes.length]!,
        endereco_entrega: `RUA DAS FLORES, ${100 + i}, SALA 2 — CENTRO, MAFRA/SC, 89300000`,
        // Seis cidades de verdade, como na carga 022: o cabeçalho de grupo
        // entra no orçamento de páginas deste teste.
        cidade: cidades[i % cidades.length]!,
        total_cents: 19500,
        status: "na_carga",
        itens,
      };
    });
    expect(paradas.reduce((s, p) => s + p.itens.length, 0)).toBe(50);

    const buf = await renderRomaneioPdf(
      { nome: "Bill Higiene e Limpeza" },
      { numero: 22, placa: null, veiculo_tipo: null, motorista_nome: null, paradas },
    );
    const paginas = (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(paginas).toBeGreaterThan(0);
    expect(paginas).toBeLessThanOrEqual(2);
  });
}, 60000);
