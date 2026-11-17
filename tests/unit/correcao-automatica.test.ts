import { describe, expect, it } from "vitest";

import {
  type CadastroPublico,
  type DestinatarioDaTela,
  type ItemDaTela,
  planejarCorrecaoAutomatica,
  resumirPlano,
} from "@/lib/fiscal/correcao-automatica";

/**
 * O PLANO DE CORREÇÃO — o que a máquina pode consertar sozinha na nota, e o que
 * ela tem de devolver para quem opera.
 *
 * As regras que estes testes prendem são as que separam "ajudar" de "inventar":
 *
 * 1. **Nunca sobrescreve** dado digitado. Endereço digitado pelo operador manda,
 *    mesmo que o cadastro público diga outra coisa.
 * 2. **Nunca inventa dado fiscal.** IE só da UF do destinatário, vinda da fonte;
 *    não existe IE na UF → campo vazio + pendência que explica as opções.
 * 3. **O que não dá para consertar aparece.** CFOP e NCM sem cadastro não são
 *    "corrigidos" em silêncio: viram pendência com a ação que resolve.
 */

const CADASTRO: CadastroPublico = {
  razao_social: "EMPRESA EXEMPLO LTDA",
  logradouro: "AVENIDA PAULISTA",
  numero: "1000",
  bairro: "BELA VISTA",
  municipio: "SAO PAULO",
  uf: "SP",
  cep: "01310100",
  ie: "123456789",
  ufs_com_inscricao: ["SP"],
  inscricoes: [{ ie: "123456789", uf: "SP", ativo: true }],
};

const VAZIO: DestinatarioDaTela = {
  nome: "EMPRESA EXEMPLO LTDA",
  documento: "11222333000181",
  ie: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "SP",
  cep: "",
};

const ITEM_OK: ItemDaTela = {
  order_item_id: "item-1",
  descricao: "Produto",
  ncm: "12345678",
  cfop: "5102",
  unidade: "UN",
  ncm_do_cadastro: null,
};

describe("planejarCorrecaoAutomatica — destinatário", () => {
  it("preenche IE, endereço e CEP do cadastro público quando estão vazios", () => {
    const plano = planejarCorrecaoAutomatica({
      destinatario: VAZIO,
      itens: [ITEM_OK],
      cadastro: CADASTRO,
    });

    expect(plano.destinatario).toEqual({
      ie: "123456789",
      logradouro: "AVENIDA PAULISTA",
      numero: "1000",
      bairro: "BELA VISTA",
      cidade: "SAO PAULO",
      cep: "01310100",
    });
    expect(plano.mudancas.map((m) => m.campo).sort()).toEqual(
      ["bairro", "cep", "cidade", "ie", "logradouro", "numero"].sort(),
    );
    expect(plano.pendencias).toEqual([]);
    expect(plano.mudancas.find((m) => m.campo === "ie")?.fonte).toBe("cadastro-publico");
  });

  it("NUNCA sobrescreve o que o operador digitou", () => {
    const digitado: DestinatarioDaTela = {
      ...VAZIO,
      ie: "ISENTO",
      logradouro: "RUA QUE O OPERADOR DIGITOU",
      numero: "S/N",
      bairro: "CENTRO",
      cidade: "CAMPINAS",
      cep: "13010111",
    };
    const plano = planejarCorrecaoAutomatica({
      destinatario: digitado,
      itens: [ITEM_OK],
      cadastro: CADASTRO,
    });

    expect(plano.destinatario).toEqual({});
    expect(plano.mudancas).toEqual([]);
    // A UF da tela (SP) coincide com a do CNPJ, então nada a apontar.
    expect(plano.pendencias).toEqual([]);
  });

  it("sem IE na UF do destinatário, não preenche e explica o porquê", () => {
    const plano = planejarCorrecaoAutomatica({
      destinatario: { ...VAZIO, uf: "MG", cidade: "BELO HORIZONTE" },
      itens: [ITEM_OK],
      cadastro: { ...CADASTRO, ie: null, ufs_com_inscricao: ["SP"] },
    });

    expect(plano.destinatario.ie).toBeUndefined();
    const pendencia = plano.pendencias.find((p) => p.campo === "ie");
    expect(pendencia?.motivo).toContain("SP");
    expect(pendencia?.motivo).toContain("MG");
    expect(pendencia?.acao).toContain("ISENTO");
  });

  it("CNPJ inexistente vira pendência, não 'correção'", () => {
    const plano = planejarCorrecaoAutomatica({
      destinatario: { ...VAZIO, documento: "11222333000182" },
      itens: [ITEM_OK],
      cadastro: null,
    });
    expect(plano.pendencias.some((p) => p.campo === "documento")).toBe(true);
  });

  it("documento ausente e tamanho inválido são pendências distintas", () => {
    const semDocumento = planejarCorrecaoAutomatica({
      destinatario: { ...VAZIO, documento: null },
      itens: [ITEM_OK],
      cadastro: null,
    });
    expect(semDocumento.pendencias.find((p) => p.campo === "documento")?.motivo).toContain(
      "sem CPF/CNPJ",
    );

    const tamanhoErrado = planejarCorrecaoAutomatica({
      destinatario: { ...VAZIO, documento: "123" },
      itens: [ITEM_OK],
      cadastro: null,
    });
    expect(tamanhoErrado.pendencias.find((p) => p.campo === "documento")?.motivo).toContain(
      "11 nem 14",
    );
  });

  it("UF divergente da UF do CNPJ é pendência, não troca silenciosa", () => {
    const plano = planejarCorrecaoAutomatica({
      destinatario: { ...VAZIO, uf: "RJ", cidade: "RIO DE JANEIRO" },
      itens: [ITEM_OK],
      cadastro: CADASTRO,
    });
    const pendencia = plano.pendencias.find((p) => p.campo === "uf");
    expect(pendencia?.motivo).toContain("RJ");
    expect(pendencia?.motivo).toContain("SP");
    // A troca automática de UF mudaria o destinatário da operação — não faz.
    expect(plano.mudancas.some((m) => m.campo === "uf")).toBe(false);
  });

  it("campo acima de 60 caracteres é pendência nomeada (limite do leiaute)", () => {
    const plano = planejarCorrecaoAutomatica({
      destinatario: {
        ...VAZIO,
        logradouro: "A".repeat(61),
        numero: "1",
        bairro: "CENTRO",
        cidade: "SAO PAULO",
        cep: "01310100",
        ie: "1",
      },
      itens: [ITEM_OK],
      cadastro: null,
    });
    expect(plano.pendencias.find((p) => p.campo === "logradouro")?.motivo).toContain("61");
  });

  it("sem cadastro consultado, IE vazia vira pendência que aponta a consulta", () => {
    const plano = planejarCorrecaoAutomatica({
      destinatario: VAZIO,
      itens: [ITEM_OK],
      cadastro: null,
    });
    expect(plano.pendencias.find((p) => p.campo === "ie")?.acao).toContain("Buscar pelo CNPJ");
  });

  it("pessoa física sem IE tem pendência própria, não a de CNPJ", () => {
    const plano = planejarCorrecaoAutomatica({
      destinatario: { ...VAZIO, documento: "52998224725", uf: "SP" },
      itens: [ITEM_OK],
      cadastro: { ...CADASTRO, ie: null, ufs_com_inscricao: [] },
    });
    expect(plano.pendencias.find((p) => p.campo === "ie")?.motivo).toContain("pessoa física");
  });

  it("normaliza documento sem máscara e UF em maiúscula", () => {
    const plano = planejarCorrecaoAutomatica({
      destinatario: { ...VAZIO, documento: "11.222.333/0001-81", uf: "sp" },
      itens: [ITEM_OK],
      cadastro: null,
    });
    expect(plano.destinatario.documento).toBe("11222333000181");
    expect(plano.destinatario.uf).toBe("SP");
  });
});

describe("planejarCorrecaoAutomatica — itens", () => {
  it("NCM vazio herda o do cadastro do produto", () => {
    const plano = planejarCorrecaoAutomatica({
      destinatario: VAZIO,
      itens: [{ ...ITEM_OK, ncm: "", ncm_do_cadastro: "87654321" }],
      cadastro: CADASTRO,
    });
    expect(plano.itens).toEqual([{ order_item_id: "item-1", ncm: "87654321" }]);
    expect(plano.mudancas.find((m) => m.campo === "ncm")?.fonte).toBe("cadastro-do-produto");
  });

  it("NCM ruim sem cadastro classificado vira pendência com a descrição do item", () => {
    const plano = planejarCorrecaoAutomatica({
      destinatario: VAZIO,
      itens: [{ ...ITEM_OK, ncm: "123", descricao: "Cabo USB" }],
      cadastro: null,
    });
    const pendencia = plano.pendencias.find((p) => p.campo === "ncm");
    expect(pendencia?.motivo).toContain("Cabo USB");
    expect(pendencia?.acao).toContain("classifique");
    expect(plano.itens).toEqual([]);
  });

  it("CFOP e unidade vazios são pendências com ação — não são adivinhados", () => {
    const plano = planejarCorrecaoAutomatica({
      destinatario: VAZIO,
      itens: [{ ...ITEM_OK, cfop: "", unidade: "" }],
      cadastro: null,
    });
    expect(plano.pendencias.find((p) => p.campo === "cfop")?.acao).toContain("operação");
    expect(plano.pendencias.find((p) => p.campo === "unidade")?.acao).toContain("unidade");
  });

  it("item completo não entra no plano", () => {
    const plano = planejarCorrecaoAutomatica({
      destinatario: {
        ...VAZIO,
        ie: "1",
        logradouro: "X",
        numero: "1",
        bairro: "Y",
        cidade: "Z",
        cep: "01310100",
      },
      itens: [ITEM_OK],
      cadastro: null,
    });
    expect(plano.itens).toEqual([]);
  });
});

describe("resumirPlano", () => {
  it("conta campos e pendências em português", () => {
    const plano = planejarCorrecaoAutomatica({
      destinatario: VAZIO,
      itens: [{ ...ITEM_OK, cfop: "" }],
      cadastro: CADASTRO,
    });
    expect(resumirPlano(plano)).toContain("campos preenchidos");
    expect(resumirPlano(plano)).toContain("pendência");
  });

  it("diz que não há nada quando o destinatário está completo", () => {
    const completo: DestinatarioDaTela = {
      ...VAZIO,
      ie: "1",
      logradouro: "RUA A",
      numero: "1",
      bairro: "CENTRO",
      cidade: "SAO PAULO",
      cep: "01310100",
    };
    expect(
      resumirPlano(planejarCorrecaoAutomatica({ destinatario: completo, itens: [ITEM_OK] })),
    ).toBe("Nada a corrigir — o destinatário já está completo.");
  });
});

describe("determinismo", () => {
  it("mesma entrada, mesmo plano — clicar duas vezes não muda a proposta", () => {
    const entrada = { destinatario: VAZIO, itens: [ITEM_OK], cadastro: CADASTRO };
    expect(planejarCorrecaoAutomatica(entrada)).toEqual(planejarCorrecaoAutomatica(entrada));
  });
});
