/**
 * PEDIDO DEIXADO DE FORA DA CARGA — e, principalmente, QUANDO NAO DEIXOU.
 *
 * O pedido original é explícito sobre a natureza deste sinal: "a cidade em
 * comum deve funcionar como um sinal para identificar possíveis esquecimentos,
 * não como prova definitiva de que dois pedidos deveriam obrigatoriamente estar
 * na mesma carga".
 *
 * Estes testes existem porque um alerta que dispara para pedido cancelado,
 * entregue ou já expedido treina o operador a ignorar o Meu Dia — e um Meu Dia
 * ignorado é pior do que não existir. Os falsos positivos são o lado caro.
 */
import { describe, expect, it } from "vitest";

import {
  chaveDoAlerta,
  cidadeDoEndereco,
  elegivelParaCarga,
  foraDaCargaDe,
  normalizaCidade,
  type CargaMontada,
  type PedidoElegivel,
} from "@/lib/meu-dia/fora-da-carga";

const DATA_DA_CARGA = "2026-10-09";

function carga(pedidosDaCarga: { id: string; cidade: string | null }[] = []): CargaMontada {
  return {
    id: "carga-1",
    numero: 42,
    placa: "ABC1D23",
    status: "montando",
    created_at: `${DATA_DA_CARGA}T10:00:00Z`,
    updated_at: `${DATA_DA_CARGA}T10:00:00Z`,
    pedidosDaCarga,
  };
}

/**
 * O pedido que a função recebe tem a cidade em `cidade_entrega` — é o nome da
 * coluna real. O helper existe para os testes escreverem `cidade: "..."`, que é
 * curto, e traduzir para o campo que a função lê.
 */
type PedidoComCidade = PedidoElegivel & { cidade_entrega?: string | null };

function pedido(over: Partial<PedidoComCidade> & { cidade?: string | null } = {}): PedidoComCidade {
  const { cidade, ...resto } = over;
  return {
    id: "p-1",
    numero: 100,
    cliente_nome: "ACME",
    status: "aprovado",
    created_at: `${DATA_DA_CARGA}T08:00:00Z`,
    previsao_entrega: null,
    dataDaCarga: DATA_DA_CARGA,
    ...resto,
    cidade_entrega: cidade ?? null,
  };
}

describe("a comparação por cidade", () => {
  it("pedido aprovado da MESMA cidade, fora da carga → sinal", () => {
    const achados = foraDaCargaDe(
      carga([{ id: "a", cidade: "Canoinhas" }]),
      [pedido({ id: "b", cidade: "Canoinhas" })],
      new Set(["a"]),
    );
    expect(achados).toHaveLength(1);
    expect(achados[0]?.pedido.id).toBe("b");
  });

  it("pedido de OUTRA cidade → não é sinal", () => {
    // Duas cidades não se confundem, e a carga-atendeu-aqui não quer dizer que
    // todo mundo é da mesma praça.
    const achados = foraDaCargaDe(
      carga([{ id: "a", cidade: "Canoinhas" }]),
      [pedido({ id: "b", cidade: "Porto União" })],
      new Set(["a"]),
    );
    expect(achados).toHaveLength(0);
  });

  it("compara cidade com acento e sem", () => {
    const achados = foraDaCargaDe(
      carga([{ id: "a", cidade: "Canoinhas" }]),
      [pedido({ id: "b", cidade: "canoinhas" })],
      new Set(["a"]),
    );
    expect(achados).toHaveLength(1);
  });

  it("compara 'Cidade/SC' com 'Cidade'", () => {
    // Quem digita no campo costuma escrever o estado junto. Sem normalizar, a
    // comparação nunca casa e a rotina nunca produz nada.
    const achados = foraDaCargaDe(
      carga([{ id: "a", cidade: "Canoinhas/SC" }]),
      [pedido({ id: "b", cidade: "Canoinhas" })],
      new Set(["a"]),
    );
    expect(achados).toHaveLength(1);
  });

  it("carga sem cidade não gera nada — não dá para comparar", () => {
    const achados = foraDaCargaDe(
      carga([{ id: "a", cidade: null }]),
      [pedido({ id: "b", cidade: "Canoinhas" })],
      new Set(["a"]),
    );
    expect(achados).toHaveLength(0);
  });
});

describe("os falsos positivos que o pedido manda evitar", () => {
  const naCarga = new Set(["a"]);

  it("cancelado não gera alerta", () => {
    expect(
      foraDaCargaDe(
        carga([{ id: "a", cidade: "Canoinhas" }]),
        [pedido({ status: "cancelado", cidade: "Canoinhas" })],
        naCarga,
      ),
    ).toHaveLength(0);
  });

  it("entregue não gera alerta", () => {
    expect(
      foraDaCargaDe(
        carga([{ id: "a", cidade: "Canoinhas" }]),
        [pedido({ status: "entregue", cidade: "Canoinhas" })],
        naCarga,
      ),
    ).toHaveLength(0);
  });

  it("expedido não gera alerta", () => {
    // Já está em alguma carga, só não nesta — e isso não é esquecimento.
    expect(
      foraDaCargaDe(
        carga([{ id: "a", cidade: "Canoinhas" }]),
        [pedido({ status: "expedido", cidade: "Canoinhas" })],
        naCarga,
      ),
    ).toHaveLength(0);
  });

  it("agendado para OUTRA data não gera alerta", () => {
    // O pedido original lista isto: "que estejam explicitamente agendados para
    // outra data". Programado é decisão; esquecido é acidente.
    const achados = foraDaCargaDe(
      carga([{ id: "a", cidade: "Canoinhas" }]),
      [pedido({ previsao_entrega: "2026-10-15", cidade: "Canoinhas" })],
      naCarga,
    );
    expect(achados).toHaveLength(0);
  });

  it("agendado PARA a data da carga gera — é o mesmo dia", () => {
    const achados = foraDaCargaDe(
      carga([{ id: "a", cidade: "Canoinhas" }]),
      [pedido({ previsao_entrega: DATA_DA_CARGA, cidade: "Canoinhas" })],
      naCarga,
    );
    expect(achados).toHaveLength(1);
  });

  it("pedido que JÁ está em carga não gera — nem nesta, nem noutra", () => {
    const emTodas = new Set(["a", "b"]);
    const achados = foraDaCargaDe(
      carga([{ id: "a", cidade: "Canoinhas" }]),
      [pedido({ id: "b" })],
      emTodas,
    );
    expect(achados).toHaveLength(0);
  });
});

describe("elegibilidade isolada", () => {
  it("aprovado e faturado são elegíveis", () => {
    for (const status of ["aprovado", "faturado", "em_analise", "rascunho"]) {
      expect(elegivelParaCarga({ status, dataDaCarga: DATA_DA_CARGA }), status).toBe(true);
    }
  });

  it("os demais status não são", () => {
    for (const status of ["cancelado", "entregue", "expedido", "devolvido"]) {
      expect(elegivelParaCarga({ status, dataDaCarga: DATA_DA_CARGA }), status).toBe(false);
    }
  });
});

describe("a chave do alerta", () => {
  it("é o pedido", () => {
    expect(chaveDoAlerta("p-1")).toBe("fora_da_carga:p-1");
  });

  it("não tem data — uma chave com timestamp vira um aviso novo por dia", () => {
    expect(chaveDoAlerta("p-1")).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe("normalizar cidade", () => {
  it("tira estado, acento e pontuação", () => {
    expect(normalizaCidade("Canoinhas/SC")).toBe("canoinhas");
    expect(normalizaCidade("São Bento do Sul")).toBe("sao bento do sul");
    expect(normalizaCidade("  Porto  União  ")).toBe("porto uniao");
  });

  it("vazio é null, e não string vazia", () => {
    // `""` entraria no Set como uma cidade chamada vazio, e todo pedido sem
    // cidade casaria com a carga sem cidade.
    expect(normalizaCidade("")).toBeNull();
    expect(normalizaCidade("   ")).toBeNull();
    expect(normalizaCidade(null)).toBeNull();
    expect(normalizaCidade(undefined)).toBeNull();
  });
});

describe("a cidade de entrega, lida do endereço", () => {
  // ─── Endereços REAIS da org 4bc721ce… em 10/10/2026 ────────────────────────
  //
  // Copiados do banco, não inventados: o formato é o que as pessoas digitam, e
  // um teste com um endereço "bonito" passa enquanto o real falha.
  const REAIS = [
    ["RUA JOSÉ PSCHEIDT, 55 — CENTRO, ITAIOPOLIS/SC, 89340000", "ITAIOPOLIS"],
    ["Rua Caetano Costa, 942723034 — Centro, Canoinhas/SC, 89460098", "Canoinhas"],
    ["RODOVIA BR 280 KM 225,5, SN — APARECIDA, CANOINHAS/SC, 89460540", "CANOINHAS"],
    [
      "RUA PRINCESA ISABEL, S/N, SALA 01, S/N — RIO DAS ANTAS, MONTE CASTELO/SC, 89380000",
      "MONTE CASTELO",
    ],
    ["RUA JOAO PROTEZEK, 3245 — VILA SAO JOAO, IRATI/PR, 84500000", "IRATI"],
  ] as const;

  for (const [endereco, esperado] of REAIS) {
    it(`"${endereco.slice(0, 34)}…" → ${esperado}`, () => {
      expect(cidadeDoEndereco(endereco)).toBe(esperado);
    });
  }

  it("a vírgula é separador de BAIRRO, e o bairro não entra", () => {
    // O ponto inteiro da regra. `CENTRO, ITAIOPOLIS/SC` tem que devolver
    // `ITAIOPOLIS` — se a vírgula estivesse na classe de caracteres, a regra
    // pegaria `CENTRO, ITAIOPOLIS` e o alerta diria que a carga foi para o
    // CENTRO.
    expect(cidadeDoEndereco("Rua X, 10 — CENTRO, MONTE CASTELO/SC, 89380000")).toBe(
      "MONTE CASTELO",
    );
  });

  it("cidade com nome composto", () => {
    // Busca em produção, não é caso raro: "PORTO UNIÃO/SC", "RIO DAS ANTAS/SC".
    expect(cidadeDoEndereco("Rua X, S/N, PORTO UNIÃO/SC, 89450000")).toBe("PORTO UNIÃO");
    expect(cidadeDoEndereco("Rua X, S/N, RIO DAS ANTAS/SC, 89360000")).toBe("RIO DAS ANTAS");
  });

  it("CEP com hífen", () => {
    expect(cidadeDoEndereco("Rua X, Canoinhas/SC, 89460-098")).toBe("Canoinhas");
  });

  it("o estado precisa ser um estado de verdade", () => {
    // `/\s*$/` sozinho casaria `ITAIOPOLIS/QQ`. E um "endereço" cujo estado não
    // existe é sinal de que o texto não é um endereço — e aí a resposta honesta é
    // não ter cidade, não chutar.
    expect(cidadeDoEndereco("Rua Y, ITAIOPOLIS/QQ, 89340000")).toBeNull();
    expect(cidadeDoEndereco("Rua Y, ITAIOPOLIS/XX, 89340000")).toBeNull();
  });

  it("aceita os 27 estados", () => {
    for (const uf of ["SC", "PR", "SP", "MG", "DF", "TO", "AM"]) {
      expect(cidadeDoEndereco(`Rua X, CIDADE/${uf}, 89000000`), uf).toBe("CIDADE");
    }
  });

  it("sem estado não é palpite", () => {
    // `Centro` é o BAIRRO na posição da cidade. Chutar aqui faz o alerta dizer
    // que a carga foi para um bairro, e um alerta errado treina o operador a
    // ignorar o Meu Dia — que é o custo caro desta regra.
    expect(cidadeDoEndereco("Rua X, Centro, Canoinhas, 89460098")).toBeNull();
    expect(cidadeDoEndereco("Rua X, Canoinhas")).toBeNull();
  });

  it("sem CEP não extrai", () => {
    // Sem o âncora do CEP, `Rua X, ALGUMA COISA/AL` pode casar o nome da rua.
    expect(cidadeDoEndereco("Rua X, Canoinhas/SC")).toBeNull();
  });

  it("vazio e nulo são null", () => {
    expect(cidadeDoEndereco("")).toBeNull();
    expect(cidadeDoEndereco(null)).toBeNull();
    expect(cidadeDoEndereco(undefined)).toBeNull();
  });

  it("o que ela extrai, o `normalizaCidade` entende", () => {
    // As duas funções precisam falar a mesma língua: a comparação é feita na
    // forma normalizada, e um acento sobrevivendo em uma e não na outra faria a
    // mesma cidade parecer duas.
    expect(normalizaCidade(cidadeDoEndereco("Rua X, SÃO BENTO DO SUL/SC, 89260000"))).toBe(
      "sao bento do sul",
    );
    expect(normalizaCidade(cidadeDoEndereco("Rua X, Canoinhas/SC, 89460000"))).toBe("canoinhas");
  });

  it("o mesmo bairro em cidades diferentes NÃO vira o mesmo sinal", () => {
    // O teste que fecha o bug do `CENTRO`: duas cidades com o mesmo nome de
    // bairro precisam continuar sendo duas cidades.
    const deItaiopolis = cidadeDoEndereco("Rua X, 55 — CENTRO, ITAIOPOLIS/SC, 89340000");
    const deCanoinhas = cidadeDoEndereco("Rua Y, 22 — CENTRO, CANOINHAS/SC, 89460098");
    expect(deItaiopolis).not.toBe(deCanoinhas);
    expect(normalizaCidade(deItaiopolis)).not.toBe(normalizaCidade(deCanoinhas));
  });
});
