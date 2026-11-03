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
import { agruparItensRepetidos, ordenarParadasDoRomaneio, renderRomaneioPdf } from "@/lib/comercial/romaneio-pdf";
import { numeroDoPedidoPdf } from "@/lib/comercial/pedido-pdf";

/**
 * O CONTRATO DA EXPEDIÇÃO — cerca do ATT.txt Fase 3.
 */
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
  it("só aprovado/faturado embarca — em_analise precisa aprovar antes", () => {
    expect((STATUS_EMBARCAVEIS as readonly string[]).includes("rascunho")).toBe(false);
    expect((STATUS_EMBARCAVEIS as readonly string[]).includes("em_analise")).toBe(false);
    expect((STATUS_EMBARCAVEIS as readonly string[]).includes("aprovado")).toBe(true);
    expect((STATUS_EMBARCAVEIS as readonly string[]).includes("faturado")).toBe(true);
    expect((STATUS_EMBARCAVEIS as readonly string[]).includes("expedido")).toBe(false);
    expect((STATUS_EMBARCAVEIS as readonly string[]).includes("entregue")).toBe(false);
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
