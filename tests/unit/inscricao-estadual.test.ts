import { describe, expect, it, vi } from "vitest";

import {
  buscarInscricoesEstaduais,
  escolherIe,
  type InscricaoEstadual,
  normalizarLista,
  ufsComInscricao,
} from "@/lib/brasil/inscricao-estadual";

/**
 * A IE — o dado que a NF-e exige e que a BrasilAPI não publica.
 *
 * O que estes testes prendem:
 * - a fonte certa (`publica.cnpj.ws`) e o parser tolerante ao formato;
 * - **IE de outra UF nunca é escolhida** — preencher com ela troca a rejeição
 *   232 por uma rejeição de divergência de UF, que é pior porque o dado parece
 *   certo;
 * - a consulta nunca lança: fonte fora do ar não pode impedir cadastro.
 */
describe("normalizarLista", () => {
  it("lê o formato da fonte, com estado aninhado", () => {
    expect(
      normalizarLista([
        {
          inscricao_estadual: "283058749",
          ativo: true,
          estado: { sigla: "rj" },
        },
      ]),
    ).toEqual([{ ie: "283058749", uf: "RJ", ativo: true }]);
  });

  it("aceita `uf` plana e descarta o que não tem número ou UF", () => {
    const lista = normalizarLista([
      { inscricao_estadual: "123", uf: "sp" },
      { inscricao_estadual: "", uf: "SP" },
      { inscricao_estadual: "999" },
      { uf: "SP" },
      null,
      "texto",
    ]);
    expect(lista).toEqual([{ ie: "123", uf: "SP", ativo: true }]);
  });

  it("lista que não é lista vira vazio, sem lançar", () => {
    expect(normalizarLista(undefined)).toEqual([]);
    expect(normalizarLista({})).toEqual([]);
    expect(normalizarLista("x")).toEqual([]);
  });

  it("`ativo: false` é preservado — a escolha prefere a ativa", () => {
    expect(normalizarLista([{ inscricao_estadual: "1", uf: "SP", ativo: false }])).toEqual([
      { ie: "1", uf: "SP", ativo: false },
    ]);
  });
});

describe("escolherIe", () => {
  const ies: InscricaoEstadual[] = [
    { ie: "111", uf: "RJ", ativo: false },
    { ie: "222", uf: "SP", ativo: true },
    { ie: "333", uf: "SP", ativo: false },
  ];

  it("devolve a da UF pedida", () => {
    expect(escolherIe(ies, "SP")).toBe("222");
    expect(escolherIe(ies, "sp")).toBe("222");
  });

  it("não devolve IE de outra UF — null é a resposta certa", () => {
    expect(escolherIe(ies, "MG")).toBeNull();
    expect(escolherIe(ies, "")).toBeNull();
    expect(escolherIe(undefined, "SP")).toBeNull();
  });

  it("prefere a ativa e é determinística entre duas ativas", () => {
    expect(
      escolherIe(
        [
          { ie: "20", uf: "SP", ativo: true },
          { ie: "3", uf: "SP", ativo: true },
        ],
        "SP",
      ),
    ).toBe("3");
  });

  it("mesmo CNPJ, mesma resposta — ordenação numérica, não lexicográfica", () => {
    const lista: InscricaoEstadual[] = [
      { ie: "100", uf: "SP", ativo: true },
      { ie: "99", uf: "SP", ativo: true },
    ];
    expect(escolherIe(lista, "SP")).toBe("99");
    expect(escolherIe([...lista].reverse(), "SP")).toBe("99");
  });
});

describe("ufsComInscricao", () => {
  it("lista só UFs com IE ativa, sem repetir e ordenado", () => {
    expect(
      ufsComInscricao([
        { ie: "1", uf: "SP", ativo: true },
        { ie: "2", uf: "SP", ativo: true },
        { ie: "3", uf: "RJ", ativo: false },
        { ie: "4", uf: "MG", ativo: true },
      ]),
    ).toEqual(["MG", "SP"]);
  });

  it("vazio quando não há nada", () => {
    expect(ufsComInscricao(undefined)).toEqual([]);
    expect(ufsComInscricao([])).toEqual([]);
  });
});

describe("buscarInscricoesEstaduais", () => {
  const resposta = (corpo: unknown, status = 200) =>
    ({ ok: status >= 200 && status < 300, status, json: async () => corpo }) as Response;

  it("CNPJ inválido nem sai à rede", async () => {
    const fetch = vi.fn();
    const r = await buscarInscricoesEstaduais("123", fetch as unknown as typeof window.fetch);
    expect(r).toEqual({ ok: false, erro: "cnpj_invalido", inscricoes: [] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("consulta a fonte que publica IE e devolve a lista normalizada", async () => {
    const fetch = vi.fn(async () =>
      resposta({
        estabelecimento: {
          inscricoes_estaduais: [
            { inscricao_estadual: "0748878600131", ativo: true, estado: { sigla: "RJ" } },
          ],
        },
      }),
    );
    const r = await buscarInscricoesEstaduais(
      "33.000.167/0001-01",
      fetch as unknown as typeof window.fetch,
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://publica.cnpj.ws/cnpj/33000167000101",
      expect.anything(),
    );
    expect(r).toEqual({
      ok: true,
      inscricoes: [{ ie: "0748878600131", uf: "RJ", ativo: true }],
    });
  });

  it("404 é `nao_encontrado`; fora do ar é `servico_indisponivel` — nunca throw", async () => {
    const naoAchou = vi.fn(async () => resposta({}, 404));
    expect(await buscarInscricoesEstaduais("33000167000101", naoAchou as never)).toEqual({
      ok: false,
      erro: "nao_encontrado",
      inscricoes: [],
    });

    const caiu = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    expect(await buscarInscricoesEstaduais("33000167000101", caiu as never)).toEqual({
      ok: false,
      erro: "servico_indisponivel",
      inscricoes: [],
    });
  });
});
