import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  carregarDestinatario,
  documentoFiscal,
  indicadorIe,
  montarDestinatario,
  type ContatoFiscal,
} from "./destinatario-da-nota";

/**
 * O destinatário da NF-e sai do cadastro do cliente. Antes, o formulário pedia
 * o endereço inteiro de novo e a nota levava do pedido só `cliente_nome` e
 * `cliente_documento` — duas fotos do dia da importação.
 */
const WANDERLEI: ContatoFiscal = {
  id: "103674b8-f178-4ae5-ab27-1a2cb11e34a4",
  name: "WANDERLEI MACHADO",
  display_name: "Wanderlei Machado",
  // O banco guarda só dígitos (medido no Mercos: "33562819000100").
  cnpj: "12345678000195",
  logradouro: "RUA JOÃO FRANCISCO DE ASSIS",
  numero_end: "27",
  complemento: "EDIFÍCIO",
  bairro: "CENTRO",
  cidade: "Mafra",
  uf: "SC",
  cep: "89303-092",
};

describe("documentoFiscal", () => {
  it("aceita só CPF (11) e CNPJ (14), com ou sem máscara", () => {
    expect(documentoFiscal("12.345.678/0001-95")).toBe("12345678000195");
    expect(documentoFiscal("123.456.789-01")).toBe("12345678901");
  });

  it("recusa tamanho que a SEFAZ não aceita, em vez de mandar assim", () => {
    expect(documentoFiscal("123")).toBeNull();
    expect(documentoFiscal("1234567890123")).toBeNull();
    expect(documentoFiscal("")).toBeNull();
    expect(documentoFiscal(null)).toBeNull();
  });
});

describe("indicadorIe", () => {
  it("IE de verdade → contribuinte (1), sem a máscara que o leiaute não aceita", () => {
    expect(indicadorIe("90176799-85")).toEqual({ ie: "9017679985", indicador: "1" });
    expect(indicadorIe("254804470")).toEqual({ ie: "254804470", indicador: "1" });
  });

  it("'ISENTO' → isento (2), sem tag de IE", () => {
    expect(indicadorIe("ISENTO")).toEqual({ ie: null, indicador: "2" });
    expect(indicadorIe(" isento ")).toEqual({ ie: null, indicador: "2" });
  });

  it("sem IE → não contribuinte (9), o padrão do leiaute", () => {
    expect(indicadorIe(null)).toEqual({ ie: null, indicador: "9" });
    expect(indicadorIe("  ")).toEqual({ ie: null, indicador: "9" });
    // Fora do TIe (2..14 alfanuméricos): não inventa contribuinte.
    expect(indicadorIe("X")).toEqual({ ie: null, indicador: "9" });
    expect(indicadorIe("123456789012345")).toEqual({ ie: null, indicador: "9" });
  });
});

describe("montarDestinatario", () => {
  it("monta nome, documento e TLocal do cadastro, com o cMun do IBGE resolvido da cidade/UF", () => {
    const d = montarDestinatario(
      { cliente_nome: "WANDERLEI MACHADO (IMPORTADO)", cliente_documento: null },
      WANDERLEI,
    );
    expect(d.nome).toBe("Wanderlei Machado");
    expect(d.documento).toBe("12345678000195");
    expect(d.indicador_ie).toBe("9");
    expect(d.ie).toBeNull();
    expect(d.faltando).toEqual([]);
    expect(d.entrega).toEqual({
      logradouro: "RUA JOÃO FRANCISCO DE ASSIS",
      numero: "27",
      complemento: "EDIFÍCIO",
      bairro: "CENTRO",
      municipio: "Mafra",
      codigo_municipio: "4210100",
      uf: "SC",
      cep: "89303092",
    });
  });

  it("UF vazio com o estado por extenso na cidade fecha o TLocal sem pedir ajuste", () => {
    // O cadastro do Mercos escrevia "Mafra, Santa Catarina" com o `uf` estruturado
    // vazio — a mesma cadeia do PED-19447: o município resolvia, mas o `uf` vazio
    // mantinha o TLocal incompleto e a emissão recusava com "UF" em faltando. A
    // sigla sai da resolução do município (UF_POR_NOME), cobrindo "SC", "PR" e os
    // demais estados por extenso.
    const d = montarDestinatario(
      { cliente_nome: "POSTO TIO RUI" },
      { ...WANDERLEI, cidade: "Mafra, Santa Catarina", uf: "" },
    );
    expect(d.faltando).toEqual([]);
    expect(d.entrega).not.toBeNull();
    expect(d.entrega?.uf).toBe("SC");
    expect(d.entrega?.codigo_municipio).toBe("4210100");
  });

  it("o cadastro vence o pedido no nome e no documento; o pedido é só reserva", () => {
    const semNome = montarDestinatario(
      { cliente_nome: "NOME DO PEDIDO", cliente_documento: "98765432000110" },
      { ...WANDERLEI, display_name: null, name: "NOME DO CADASTRO", cnpj: null },
    );
    expect(semNome.nome).toBe("NOME DO CADASTRO");
    expect(semNome.documento).toBe("98765432000110");
  });

  it("a IE do cadastro chega ao destinatário como contribuinte", () => {
    const d = montarDestinatario(
      { cliente_nome: "CONTRIBUINTE" },
      { ...WANDERLEI, cnpj: "29067113023722", ie: "254804470" },
    );
    expect(d.indicador_ie).toBe("1");
    expect(d.ie).toBe("254804470");
  });

  it("sem contato nenhum, usa o que o pedido congelou — e nomeia o que falta", () => {
    const d = montarDestinatario(
      { cliente_nome: "CLIENTE SEM CADASTRO", cliente_documento: null },
      null,
    );
    expect(d.nome).toBe("CLIENTE SEM CADASTRO");
    expect(d.documento).toBeNull();
    expect(d.entrega).toBeNull();
    expect(d.faltando).toEqual([
      "logradouro",
      "número do endereço",
      "bairro",
      "cidade/UF (ou o código IBGE do município)",
      "UF",
      "CPF/CNPJ",
    ]);
  });

  it("endereço pela metade não vira TLocal pela metade: volta com o campo faltando nomeado", () => {
    const d = montarDestinatario(
      { cliente_nome: "MEIO CADASTRO" },
      { ...WANDERLEI, numero_end: null, bairro: " ", cidade: "Cidade Que Não Existe" },
    );
    expect(d.entrega).toBeNull();
    expect(d.faltando).toEqual([
      "número do endereço",
      "bairro",
      "cidade/UF (ou o código IBGE do município)",
    ]);
  });

  it("cidade ambígua sem UF não é escolhida no chute", () => {
    const d = montarDestinatario(
      { cliente_nome: "HOMÔNIMO" },
      { ...WANDERLEI, cidade: "Bom Jesus", uf: null },
    );
    expect(d.entrega).toBeNull();
    expect(d.faltando).toContain("cidade/UF (ou o código IBGE do município)");
  });

  it("cliente com só CPF no Mercos: o documento sai do cadastro, não do pedido", () => {
    // O pedido 19341 é o caso real: `contacts.cnpj` vazio e o CPF em
    // `source_metadata.mercos.documento`. Antes, a nota pedia CPF/CNPJ a um
    // cliente que tem CPF — só que guardado no lugar que ninguém lia.
    const d = montarDestinatario(
      { cliente_nome: "WANDERLEI MACHADO", cliente_documento: null },
      { ...WANDERLEI, cnpj: null, source_metadata: { mercos: { documento: "42040906991" } } },
    );
    expect(d.documento).toBe("42040906991");
    expect(d.faltando).not.toContain("CPF/CNPJ");
  });

  it("campo acima de 60 caracteres é nomeado, não cortado", () => {
    const d = montarDestinatario(
      { cliente_nome: "ENDEREÇO LONGO" },
      { ...WANDERLEI, logradouro: "R".repeat(61) },
    );
    expect(d.entrega).toBeNull();
    expect(d.faltando).toContain("logradouro com mais de 60 caracteres");
  });

  it("CEP que não tem 8 dígitos é omitido, não inventado", () => {
    const d = montarDestinatario({ cliente_nome: "X" }, { ...WANDERLEI, cep: "893" });
    expect(d.entrega).not.toBeNull();
    expect(d.entrega).not.toHaveProperty("cep");
  });
});

/** Stub do client: `select().eq().maybeSingle()` filtrado em memória. */
function clienteFalso(contatos: ContatoFiscal[]): SupabaseClient {
  function consulta() {
    const filtros: Record<string, string> = {};
    const api = {
      select: () => api,
      eq: (coluna: string, valor: string) => {
        filtros[coluna] = valor;
        return api;
      },
      maybeSingle: async () => ({
        data:
          contatos.find((c) =>
            Object.entries(filtros).every(
              ([coluna, valor]) =>
                // O filtro de organização é do client real; o fixture não o carrega.
                coluna === "organization_id" ||
                (c as unknown as Record<string, unknown>)[coluna] === valor,
            ),
          ) ?? null,
      }),
    };
    return api;
  }
  return { from: () => consulta() } as unknown as SupabaseClient;
}

describe("carregarDestinatario", () => {
  it("lê o contato pelo vínculo do pedido", async () => {
    const d = await carregarDestinatario(
      clienteFalso([WANDERLEI]),
      "org",
      { contact_id: WANDERLEI.id, cliente_nome: "OUTRO NOME" },
    );
    expect(d.nome).toBe("Wanderlei Machado");
    expect(d.entrega?.codigo_municipio).toBe("4210100");
  });

  it("sem vínculo, procura pelo CNPJ do pedido — o caminho dos importados", async () => {
    const d = await carregarDestinatario(
      clienteFalso([WANDERLEI]),
      "org",
      { contact_id: null, cliente_documento: "12.345.678/0001-95" },
    );
    expect(d.nome).toBe("Wanderlei Machado");
    expect(d.documento).toBe("12345678000195");
  });

  it("contato que sumiu não derruba a emissão: volta o que falta, para a tela completar", async () => {
    const d = await carregarDestinatario(
      clienteFalso([]),
      "org",
      { contact_id: WANDERLEI.id, cliente_nome: "FANTASMA" },
    );
    expect(d.nome).toBe("FANTASMA");
    expect(d.entrega).toBeNull();
    expect(d.faltando.length).toBeGreaterThan(0);
  });
});
