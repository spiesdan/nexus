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

  it("o 'NULL' literal do import não chega ao TLocal nem ao <entrega>", () => {
    // Medido em produção em 18/11/2026: o cadastro da BRASNILE (CNPJ
    // 78549615000169) tinha `logradouro = "RODOVIA SC 303, S/N, NULL"` — o
    // export do Mercos/WP escreve a ausência como texto. A NF-e 4655 mandou
    // esse "NULL" como rua do destinatário; a 4656 (depois da limpeza) saiu
    // limpa. O que não pode voltar: o literal viajar para a SEFAZ.
    const comNull: ContatoFiscal = {
      ...WANDERLEI,
      logradouro: "RODOVIA SC 303, S/N, NULL",
      bairro: "PARQUE INDUSTRIAL NULL",
      complemento: "NULL",
    };
    const d = montarDestinatario(
      { cliente_nome: "BRASNILE INDUSTRIAL LTDA", cliente_documento: null },
      comNull,
    );
    expect(d.entrega?.logradouro).toBe("RODOVIA SC 303, S/N");
    expect(d.entrega?.bairro).toBe("PARQUE INDUSTRIAL");
    expect(d.entrega?.complemento).toBeUndefined();
    expect(JSON.stringify(d)).not.toMatch(/NULL/);
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

/**
 * O CPF que o operador digitou na FICHA.
 *
 * O resolvedor fiscal lia `cnpj` e `source_metadata.mercos.documento`; se o
 * documento foi digitado no CRM (campo cifrado), a NF-e pedia CPF a quem tem
 * CPF. O fallback decifra na hora e só quando não há documento no cadastro.
 */
function clienteComCpf(contato: unknown, cpf: string | null): SupabaseClient {
  return {
    from(tabela: string) {
      if (tabela !== "contacts") throw new Error(`tabela inesperada: ${tabela}`);
      const q: Record<string, unknown> = {
        select: () => q,
        eq: () => q,
        maybeSingle: () => Promise.resolve({ data: contato, error: null }),
      };
      return q;
    },
    rpc: () => Promise.resolve({ data: cpf, error: null }),
  } as unknown as SupabaseClient;
}

describe("carregarDestinatario — CPF cifrado da ficha", () => {
  it("usa o CPF da ficha quando o cadastro não tem documento", async () => {
    const contato = { ...WANDERLEI, cnpj: null };
    const d = await carregarDestinatario(clienteComCpf(contato, "42040906991"), "org-1", {
      cliente_nome: "AMERICO YOSHIO NAGANO",
      contact_id: contato.id,
    });
    expect(d.documento).toBe("42040906991");
    expect(d.faltando).not.toContain("CPF/CNPJ");
  });

  it("sem CPF em lugar nenhum, o campo continua faltando — não inventa", async () => {
    const contato = { ...WANDERLEI, cnpj: null };
    const d = await carregarDestinatario(clienteComCpf(contato, null), "org-1", {
      cliente_nome: "AMERICO YOSHIO NAGANO",
      contact_id: contato.id,
    });
    expect(d.documento).toBeNull();
    expect(d.faltando).toContain("CPF/CNPJ");
  });

  it("cadastro com CNPJ não chama a RPC — a coluna vence", async () => {
    let chamou = false;
    const cliente = {
      from(tabela: string) {
        const q: Record<string, unknown> = {
          select: () => q,
          eq: () => q,
          maybeSingle: () => Promise.resolve({ data: WANDERLEI, error: null }),
        };
        return q;
      },
      rpc: () => {
        chamou = true;
        return Promise.resolve({ data: "42040906991", error: null });
      },
    } as unknown as SupabaseClient;
    const d = await carregarDestinatario(cliente, "org-1", {
      cliente_nome: WANDERLEI.name,
      contact_id: WANDERLEI.id,
    });
    expect(d.documento).toBe("12345678000195");
    expect(chamou).toBe(false);
  });
});

/**
 * O dono viu "6 pendências" na NF-e e perguntou por que o endereço do pedido
 * não preenche sozinho. O coletor Mercos não traz rua/número/bairro; o pedido
 * traz. Cadastro ganha; o que falta nele vem do pedido e a origem é dita.
 */
describe("endereço do pedido como reserva fiscal", () => {
  const semEndereco: ContatoFiscal = {
    id: "contato-sem-endereco",
    name: "FULANO LTDA",
    cnpj: "12345678000195",
  };

  it.each([
    [
      "FAZ BATATAIS, S/N — BELA VISTA DO SUL, MAFRA/SC, 89300001",
      "S/N",
      "BELA VISTA DO SUL",
    ],
    [
      "BR-280, 1421, DE 1180 A 1998 LADO PAR, 1421 — CAMPO DA ÁGUA VERDE, Canoinhas/SC, 89466218",
      "1421",
      "CAMPO DA ÁGUA VERDE",
    ],
  ])("o endereço real %s resolve as 5 pendências de endereço", (endereco, numero, bairro) => {
    const antes = montarDestinatario({ cliente_nome: "FULANO LTDA" }, semEndereco);
    const depois = montarDestinatario(
      { cliente_nome: "FULANO LTDA", endereco_entrega: endereco },
      semEndereco,
    );
    expect(antes.faltando).toEqual([
      "logradouro",
      "número do endereço",
      "bairro",
      "cidade/UF (ou o código IBGE do município)",
      "UF",
    ]);
    expect(depois.faltando).toEqual([]);
    expect(depois.entrega?.numero).toBe(numero);
    expect(depois.entrega?.bairro).toBe(bairro);
    expect(depois.origem.logradouro).toBe("pedido");
    expect(depois.origem.numero).toBe("pedido");
    expect(depois.origem.bairro).toBe("pedido");
    expect(depois.origem.cidade).toBe("pedido");
    expect(depois.origem.uf).toBe("pedido");
  });

  it("cadastro completo ganha: o pedido não sobrescreve nada", () => {
    const d = montarDestinatario(
      {
        cliente_nome: "IMPORTADO",
        endereco_entrega: "FAZ BATATAIS, S/N — BELA VISTA DO SUL, MAFRA/SC, 89300001",
      },
      WANDERLEI,
    );
    expect(d.entrega?.logradouro).toBe("RUA JOÃO FRANCISCO DE ASSIS");
    expect(d.entrega?.numero).toBe("27");
    expect(d.entrega?.bairro).toBe("CENTRO");
    expect(d.origem.logradouro).toBe("cadastro");
    expect(d.origem.numero).toBe("cadastro");
    expect(d.origem.bairro).toBe("cadastro");
  });

  it("texto ambíguo não chuta: pendências continuam, origem fica nula", () => {
    const d = montarDestinatario(
      { cliente_nome: "FULANO LTDA", endereco_entrega: "RUA SEM TRAVESSÃO, 10, MAFRA/SC" },
      semEndereco,
    );
    expect(d.entrega).toBeNull();
    expect(d.faltando).toContain("logradouro");
    expect(d.origem.logradouro).toBeNull();
  });
});

describe("resolução determinística da UF no clique de emitir", () => {
  const enderecoCompleto = {
    ...WANDERLEI,
    logradouro: "Avenida Michele Simonetti",
    numero_end: "357",
    bairro: "Sao Miguel",
    cep: "89580-000",
  };

  it("Campo do Tenente/SC: payload sai certo (4104105/PR) e corrigido diz o que mudou", () => {
    const d = montarDestinatario(
      { cliente_nome: "PEREIRA MOTORS" },
      { ...enderecoCompleto, cidade: "Campo do Tenente", uf: "SC" },
    );
    expect(d.entrega?.codigo_municipio).toBe("4104105");
    expect(d.entrega?.uf).toBe("PR");
    expect(d.corrigido).toEqual({ campo: "uf", de: "SC", para: "PR" });
    expect(d.faltando).toEqual([]);
  });

  it("Irati/XX:ambiguidade nomeia PR e SC, entrega nula e nada é corrigido", () => {
    const d = montarDestinatario(
      { cliente_nome: "HOMONIMO" },
      { ...enderecoCompleto, cidade: "Irati", uf: "XX" },
    );
    expect(d.entrega).toBeNull();
    expect(d.corrigido).toBeNull();
    expect(d.faltando.join(" ")).toContain("PR e SC");
  });

  it("par válido não muda nada", () => {
    const d = montarDestinatario(
      { cliente_nome: "PEREIRA MOTORS" },
      { ...enderecoCompleto, cidade: "Mafra", uf: "SC" },
    );
    expect(d.corrigido).toBeNull();
    expect(d.faltando).toEqual([]);
    expect(d.entrega?.uf).toBe("SC");
  });
});
