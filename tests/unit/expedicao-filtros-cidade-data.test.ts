/**
 * O FILTRO DO ROMANEIO: cidade e período.
 *
 * O defeito medido em produção: 107 dos 109 pedidos abertos não têm
 * `endereco_entrega`, e a cidade do cadastro do cliente resolve alguns deles.
 * Filtrar por uma fonte só esconde a fila inteira — e a pessoa conclui que o
 * pedido não existe. Aqui ficam as duas fontes e o "quantos ficaram de fora".
 */
import { describe, expect, it } from "vitest";

import {
  diaDeReferencia,
  documentoNormalizado,
  filtrarEmbarcaveisPor,
  temCidade,
  vincularPorDocumento,
} from "@/lib/expedicao/buscar-embarcavel";

const PEDIDOS = [
  {
    id: "a",
    numero: 1,
    cliente_nome: "Mecanica Alfa",
    cliente_documento: null,
    endereco_entrega: "RUA X, 10 - VIDEIRA/SC",
    contact_id: "c1",
    previsao_entrega: "2026-10-20",
    created_at: "2026-10-18T12:00:00.000Z",
  },
  {
    id: "b",
    numero: 2,
    cliente_nome: "Posto Beta",
    cliente_documento: null,
    endereco_entrega: null,
    contact_id: "c2",
    previsao_entrega: null,
    created_at: "2026-10-19T12:00:00.000Z",
  },
  {
    id: "c",
    numero: 3,
    cliente_nome: "Oficina Gama",
    cliente_documento: null,
    endereco_entrega: "AV Y - CANOINHAS/SC",
    contact_id: null,
    previsao_entrega: "2026-10-25",
    created_at: "2026-10-19T12:00:00.000Z",
  },
  {
    id: "d",
    numero: 4,
    cliente_nome: "Cliente sem cadastro",
    cliente_documento: null,
    endereco_entrega: null,
    contact_id: null,
    previsao_entrega: null,
    created_at: "2026-10-19T12:00:00.000Z",
  },
];

const CIDADES: Record<string, string> = {
  c2: "Uniao da Vitoria/PR",
  c1: "VIDEIRA/SC",
};
const doContato = (id: string | null | undefined) => (id ? (CIDADES[id] ?? null) : null);

const ids = (f: Parameters<typeof filtrarEmbarcaveisPor>[1]) =>
  filtrarEmbarcaveisPor(PEDIDOS, f, doContato).map((p) => p.id);

describe("filtrarEmbarcaveisPor — cidade", () => {
  it("acha pela cidade do ENDEREÇO do pedido", () => {
    expect(ids({ cidade: "canoinhas" })).toEqual(["c"]);
  });

  it("acha pela cidade do CADASTRO do cliente, quando o pedido não tem endereço", () => {
    // Sem esta fonte, o pedido `b` seria invisível para o filtro — e é o caso
    // da maioria da base (107 de 109 pedidos abertos sem endereço).
    expect(ids({ cidade: "união da vitória" })).toEqual(["b"]);
  });

  it("acha pelo endereço do pedido quando o cadastro não tem cidade", () => {
    expect(ids({ cidade: "videira" })).toEqual(["a"]);
  });

  it("ignora acento e caixa nas duas fontes", () => {
    expect(ids({ cidade: "CANOINHAS" })).toEqual(["c"]);
  });

  it("some com quem não casa em nenhuma das fontes", () => {
    expect(ids({ cidade: "canoinhas" })).not.toContain("d");
  });

  it("cidade vazia não filtra nada", () => {
    expect(ids({})).toHaveLength(PEDIDOS.length);
  });
});

describe("filtrarEmbarcaveisPor — período", () => {
  it("usa a previsão de entrega quando existe", () => {
    expect(ids({ de: "2026-10-20", ate: "2026-10-20" })).toEqual(["a"]);
  });

  it("cai na data de criação quando não há previsão", () => {
    // `b` e `d` não têm previsão e foram criados em 19/10.
    expect(ids({ de: "2026-10-19", ate: "2026-10-19" })).toEqual(["b", "d"]);
  });

  it("recorta um intervalo aberto de um lado", () => {
    expect(ids({ de: "2026-10-21" })).toEqual(["c"]);
    expect(ids({ ate: "2026-10-19" })).toEqual(["b", "d"]);
  });

  it("o dia da criação é o dia LOCAL, não o dia UTC do carimbo", () => {
    // 02:30Z de 20/10 é 23:30 de 19/10 em São Paulo. Cortar o ISO em UTC
    // jogaria o pedido para o dia seguinte e ele sumiria do recorte do dia.
    expect(diaDeReferencia({ ...PEDIDOS[3]!, created_at: "2026-10-20T02:30:00.000Z" })).toBe(
      "2026-10-19",
    );
  });

  it("cidade e período valem juntos", () => {
    expect(ids({ cidade: "canoinhas", de: "2026-10-25", ate: "2026-10-25" })).toEqual(["c"]);
    expect(ids({ cidade: "canoinhas", de: "2026-10-20", ate: "2026-10-20" })).toEqual([]);
  });
});

describe("temCidade — o que o filtro não tem como julgar", () => {
  it("conta como sem cidade só quem não tem endereço NEM cadastro", () => {
    expect(PEDIDOS.filter((p) => !temCidade(p, doContato)).map((p) => p.id)).toEqual(["d"]);
  });
});

describe("a busca de texto também acha pela cidade", () => {
  // O campo diz "Buscar por número, cliente, cidade ou CNPJ". Antes desta
  // correção ele só olhava `endereco_entrega`, e quem tem a cidade no cadastro
  // do cliente — a maioria da base — não era achado pela busca.
  it("acha pela cidade do CADASTRO", () => {
    expect(ids({ busca: "união da vitória" })).toEqual(["b"]);
  });

  it("acha pela cidade do ENDEREÇO", () => {
    expect(ids({ busca: "canoinhas" })).toEqual(["c"]);
  });

  it("ainda acha pelo número e pelo nome", () => {
    expect(ids({ busca: "PED-0002" })).toEqual(["b"]);
    expect(ids({ busca: "oficina gama" })).toEqual(["c"]);
  });
});

describe("vincularPorDocumento — o pedido importado sem contato", () => {
  // O caso medido em produção: 107 dos 109 pedidos aprovados/faturados vieram
  // do emissor sem `contact_id`, e 101 deles casam com um cadastro pelo CNPJ.
  // Sem o vínculo, filtrar por "Canoinhas" devolvia zero com 32 pedidos de
  // Canoinhas na fila.
  const CNPJ = "81.521.056/0001-93";

  it("casa o documento com máscara contra o cadastro em dígitos", () => {
    expect(documentoNormalizado(CNPJ)).toBe("81521056000193");
    const [vinculado] = vincularPorDocumento(
      [{ ...PEDIDOS[3]!, cliente_documento: CNPJ }],
      { "81521056000193": "c9" },
    );
    expect(vinculado?.contact_id).toBe("c9");
  });

  it("não sobrescreve o contato que o pedido já tem", () => {
    const [mantido] = vincularPorDocumento(
      [{ ...PEDIDOS[0]!, contact_id: "c1", cliente_documento: CNPJ }],
      { "81521056000193": "c9" },
    );
    expect(mantido?.contact_id).toBe("c1");
  });

  it("deixa como está quem não casa com cadastro nenhum", () => {
    const [solto] = vincularPorDocumento(
      [{ ...PEDIDOS[3]!, cliente_documento: "00.000.000/0001-00" }],
      {},
    );
    expect(solto?.contact_id).toBeNull();
  });

  it("depois do vínculo, o filtro de cidade acha o pedido importado", () => {
    const importado = { ...PEDIDOS[3]!, cliente_documento: CNPJ };
    const [vinculado] = vincularPorDocumento([importado], { "81521056000193": "c9" });
    const cidades: Record<string, string> = { c9: "Canoinhas/SC" };
    expect(
      filtrarEmbarcaveisPor([vinculado!], { cidade: "canoinhas" }, (id) =>
        id ? (cidades[id] ?? null) : null,
      ),
    ).toHaveLength(1);
  });
});
