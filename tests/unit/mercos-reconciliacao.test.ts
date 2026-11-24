import { describe, expect, it } from "vitest";

// @ts-expect-error — módulo ESM do worker, sem declaração TS
import { dataDoCartao } from "../../workers/mercos/cliente.mjs";
import {
  classificarComDetalhe,
  classificarNumero,
  dentroDaJanela,
  mesmoCliente,
  payloadDeImportacao,
  temItens,
} from "../../scripts/mercos-reconciliar-logica.mjs";

const registro = {
  numero: 19669,
  cliente: { razao: "OFICINA MECANICA DO NEY", documento: "12.345.678/0001-90", fantasia: "NEY" },
  status_detalhe: "aprovado",
  total_cents: 1000,
  soma_itens_cents: 1000,
  itens: [{ codigo: "A", descricao: "Item A", quantidade: 1, subtotal: "1.000,00" }],
};

describe("payload preserva o número do Mercos", () => {
  it("numero_mercos não se perde no caminho da importação", () => {
    const p = payloadDeImportacao(registro);
    expect(p.numero).toBe(19669);
    expect(p.cliente_nome).toBe("OFICINA MECANICA DO NEY");
    expect(p.itens).toHaveLength(1);
  });
});

describe("identidade: número + cliente, não número só", () => {
  it("documento decide quando os dois lados têm", () => {
    expect(mesmoCliente("Nome A", "Nome B", "12.345.678/0001-90", "12345678000190")).toBe(true);
    expect(mesmoCliente("Nome A", "Nome A", "111", "222")).toBe(false);
  });

  it("nome normalizado decide quando a lista não traz documento", () => {
    expect(mesmoCliente("oficina mecanica do ney", "OFICINA MECÂNICA DO NEY LTDA")).toBe(false);
    expect(mesmoCliente("oficina mecanica do ney", "OFICINA MECANICA DO NEY")).toBe(true);
  });

  it("numero_mercos É a identidade: nome mudou, truncou ou virou CONSUMIDOR FINAL, continua importado", () => {
    for (const cliente of [
      "Nome Antigo Da Empresa",
      "NOME ANTIGO DA EMPRESA LTDA - TRUNCADO EM 300 CARACTERES",
      "CONSUMIDOR FINAL",
    ]) {
      const r = classificarNumero({
        numero: 19338,
        nomeLista: "Nome Completamente Diferente",
        linhasBanco: [{ id: "mercos-19338", numero_mercos: 19338, numero: 900123, cliente_nome: cliente }],
      });
      expect(r.situacao).toBe("importado");
    }
  });

  it("número ocupado por pedido LOCAL é colisão — os 4 perdidos não viram 'zero ausentes'", () => {
    for (const numero of [19669, 19670, 19671, 19672]) {
      const r = classificarNumero({
        numero,
        nomeLista: `Cliente Mercos ${numero}`,
        linhasBanco: [{ id: `local-${numero}`, numero, numero_mercos: null, cliente_nome: `Cliente Local ${numero}` }],
      });
      expect(r.situacao).toBe("colisao");
      expect(r.cliente_local_nome).toBe(`Cliente Local ${numero}`);
    }
  });

  it("sem linha no banco é ausente por número", () => {
    expect(classificarNumero({ numero: 19740, nomeLista: "X", linhasBanco: [] }).situacao).toBe("ausente");
  });

  it("linha antiga com numero = N mas sem numero_mercos é colisão pela regra — nome não resgata", () => {
    const r = classificarNumero({
      numero: 19680,
      nomeLista: "Cliente Antigo",
      linhasBanco: [{ id: "antigo", numero: 19680, numero_mercos: null, cliente_nome: "Cliente Antigo" }],
    });
    expect(r.situacao).toBe("colisao");
  });
});

describe("pedido vazio não é perda", () => {
  it("19639 (0 itens) vira ignorado_sem_itens", () => {
    expect(temItens({ itens: [] })).toBe(false);
    expect(
      classificarComDetalhe({ situacao: "ausente", detalhe: { itens: [], total_cents: 0 } }),
    ).toBe("ignorado_sem_itens");
  });

  it("ausente sem detalhe NÃO é prova", () => {
    expect(classificarComDetalhe({ situacao: "ausente", detalhe: undefined })).toBe("sem_detalhe");
  });

  it("ausente com itens segue ausente (candidato a importação)", () => {
    expect(classificarComDetalhe({ situacao: "ausente", detalhe: registro })).toBe("ausente");
  });

  it("colisão com detalhe vazio também é ignorada, não importada", () => {
    expect(classificarComDetalhe({ situacao: "colisao", detalhe: { itens: [] } })).toBe("ignorado_sem_itens");
  });
});

describe("censo pela lista", () => {
  const agora = Date.parse("2026-11-24T12:00:00Z");

  it("data do cartão da lista: presente e ausente", () => {
    expect(dataDoCartao(["#19669 emitido por JB", "16/11/2026", "R$ 10,00"])).toBe("2026-11-16");
    expect(dataDoCartao(["#19669 emitido por JB", "Concluído", "R$ 10,00"])).toBeNull();
  });

  it("17/11 entra na janela de 30 dias; 17/10 fica fora", () => {
    expect(dentroDaJanela({ data_emissao: "2026-11-17" }, agora)).toBe(true);
    expect(dentroDaJanela({ data_emissao: "2026-10-17" }, agora)).toBe(false);
  });

  it("sem data não entra na garantia", () => {
    expect(dentroDaJanela({ data_emissao: null }, agora)).toBe(false);
    expect(dentroDaJanela({}, agora)).toBe(false);
  });

  it("janela configurável, padrão 30", () => {
    const r = { data_emissao: "2026-09-26" };
    expect(dentroDaJanela(r, agora, 30)).toBe(false);
    expect(dentroDaJanela(r, agora, 60)).toBe(true);
  });
});
