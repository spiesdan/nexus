/**
 * O PÚBLICO DA CAMPANHA — quem a campanha alcança dentro da base já coletada.
 *
 * ═══ O QUE ESTE ARQUIVO PROVA QUE NÃO É ÓBVIO ════════════════════════════
 *
 * A base grava o rótulo **cru** da API do Google — inglês: "Auto repair shop",
 * "Gas station", "Tire repair shop". A campanha é montada em **português**:
 * "Oficina mecânica", "Posto de combustível", "Borracharia". Comparar as duas
 * strings direto é o mesmo erro de comparar "Salomon" com "Salomón".
 *
 * Medido em Videira/SC (17/10/2026): a campanha "Oficinas - SC" alcançava
 * **1** das 1.268 empresas da cidade — "Oficina mecânica" ≠ "Auto repair shop".
 * Um filtro que apaga a lista sem dizer por quê é bug, não filtro.
 *
 * ═══ MUTAÇÕES PROVADAS ═════════════════════════════════════════════════════
 *
 *  1. `empresaServe` voltar a comparar `daEmpresa.includes(criterio)` → reprova
 *     5 testes ("a campanha em português alcança o rótulo em inglês da base")
 *  2. `criterioDaCampanha` NÃO pré-computar `aceitas` → reprova "traduz uma vez
 *     por campanha": 21.668 linhas × 536 rótulos é trabalho que a tela paga a
 *     cada clique
 *  3. `semAcento` deixar de tirar acento em `chaveDeCidade` → reprova "cidade
 *     com acento casa com a que o operador digitou sem"
 *
 * E uma medição que tirou código, não confirmou: `categoriasAceitas` tinha um
 * passo "tradução exata" varrendo o mapa ao contrário. A mutação que o
 * desligou passou a suíte inteira — `categoriasQueCasam` compara por
 * `includes` no rótulo em português, e igualdade ⊂ `includes`. O passo foi
 * removido; o que a mutação não derruba é código que ninguém sabe se
 * trabalha.
 */
import { describe, expect, it } from "vitest";

import { categoriasQueCasam } from "@/lib/prospeccao/categoria-pt";

import {
  categoriasAceitas,
  chaveDeCidade,
  criterioDaCampanha,
  empresaServe,
  type CriterioDaBase,
  type ProspectoDaBase,
} from "@/lib/prospeccao/publico-da-base";

/** Empresa da base: o que o Google devolve, em inglês, como está no banco. */
function daBase(over: Partial<ProspectoDaBase> = {}): ProspectoDaBase {
  return {
    nome: "Auto Peças Videira",
    cidade: "Videira",
    estado: "SC",
    categoria: "Auto parts store",
    categorias: null,
    ...over,
  };
}

/** Critério cru (sem `aceitas`), como se viesse de fora da campanha. */
function criterio(categorias: string[], cidades = ["Videira"]): CriterioDaBase {
  return { cidades: cidades.map((cidade) => ({ cidade })), categorias, estado: "SC" };
}

describe("empresaServe — categoria nas duas línguas", () => {
  it("a campanha em português alcança o rótulo em inglês que a base gravou", () => {
    // O defeito medido: "Oficina mecânica" (campanha) × "Auto repair shop"
    // (base). Sem a tradução, a campanha alcançava 1 empresa em 1.268.
    expect(empresaServe(daBase({ categoria: "Auto repair shop" }), criterio(["Oficina mecânica"]))).toBe(
      true,
    );
    expect(empresaServe(daBase({ categoria: "Gas station" }), criterio(["Posto de combustível"]))).toBe(
      true,
    );
    expect(empresaServe(daBase({ categoria: "Tire repair shop" }), criterio(["Borracharia"]))).toBe(
      true,
    );
  });

  it("o termo digitado no teclado, sem acento e flexionado, ainda acha", () => {
    const c = criterio(["mecanica"]);
    expect(empresaServe(daBase({ categoria: "Auto repair shop" }), c)).toBe(true);
    expect(empresaServe(daBase({ categoria: "Mechanic" }), c)).toBe(true);
    const borracha = criterio(["borracharias"]);
    expect(empresaServe(daBase({ categoria: "Tire repair shop" }), borracha)).toBe(true);
  });

  it("categoria fora da campanha não entra — nem por resemble", () => {
    expect(empresaServe(daBase({ categoria: "Gas station" }), criterio(["Oficina mecânica"]))).toBe(
      false,
    );
    // "Oficina mecânica" puxa a oficina; NÃO traz o catálogo inteiro
    // ("Auto parts store" é outra empresa, e a campanha não pediu autopeças).
    expect(empresaServe(daBase({ categoria: "Auto parts store" }), criterio(["Oficina mecânica"]))).toBe(
      false,
    );
  });

  it("empresa sem categoria não entra quando a campanha tem categorias", () => {
    expect(
      empresaServe(daBase({ categoria: null, categorias: null }), criterio(["Oficina mecânica"])),
    ).toBe(false);
    // Categoria no plural (jsonb) também conta.
    expect(
      empresaServe(
        daBase({ categoria: null, categorias: ["Car wash", "Tire repair shop"] }),
        criterio(["Borracharia"]),
      ),
    ).toBe(true);
  });

  it("campanha sem categoria aceita a empresa da cidade", () => {
    expect(empresaServe(daBase({ categoria: null, categorias: null }), criterio([]))).toBe(true);
  });

  it("o mesmo resultado com o conjunto pré-computado e sem ele", () => {
    const cat = criterio(["Oficina mecânica", "Posto de combustível"]);
    const comSet: CriterioDaBase = { ...cat, aceitas: categoriasAceitas(cat.categorias) };
    for (const categoria of ["Auto repair shop", "Gas station", "Auto parts store"]) {
      const e = daBase({ categoria });
      expect(empresaServe(e, comSet)).toBe(empresaServe(e, cat));
    }
  });
});

describe("categoriasAceitas — o conjunto traduzido", () => {
  it("contém o termo da campanha e o rótulo gravado que ele descreve", () => {
    const aceitas = categoriasAceitas(["Oficina mecânica"]);
    expect(aceitas.has("oficina mecanica")).toBe(true); // o próprio termo
    expect(aceitas.has("auto repair shop")).toBe(true); // como a base grava
  });

  it("recolhe todo rótulo do mapa que traduz para o mesmo termo", () => {
    // "Hardware store" e "Iron ware dealer" são rótulos diferentes que a base
    // grava para o mesmo rótulo PT ("Loja de ferragens"). A campanha pediu o
    // termo em português — ela quer as duas, não só a que alguém digitou em
    // inglês. (40 pares do mapa são assim, medido.)
    const aceitas = categoriasAceitas(["Loja de ferragens"]);
    expect(aceitas.has("hardware store")).toBe(true);
    expect(aceitas.has("iron ware dealer")).toBe(true);
  });

  it("sem passo de 'tradução exata' — o conjunto é o que a busca devolve", () => {
    // Trava a remoção de código morto: este conjunto é EXATAMENTE o que
    // `categoriasQueCasam` devolve, mais o termo da campanha. Se alguém
    // repuser o passo inverso, esta asserção reprova e a pergunta volta.
    const aceitas = categoriasAceitas(["Loja de ferragens"]);
    const esperada = new Set(
      ["Loja de ferragens", ...categoriasQueCasam("Loja de ferragens")].map((v) =>
        v
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .trim(),
      ),
    );
    expect([...aceitas].sort()).toEqual([...esperada].sort());
  });

  it("aceita o termo já em inglês, que é o idioma da origem", () => {
    expect(categoriasAceitas(["Auto repair shop"]).has("auto repair shop")).toBe(true);
  });

  it("não engole o catálogo inteiro", () => {
    // O oposto de aceitar demais também é defeito: "Oficina" sozinho (termo
    // parcial) é BUSCA na tela, mas como categoria da campanha tem que ser o
    // rótulo que descreve. Aqui provamos o tamanho do conjunto do caso medido.
    expect(categoriasAceitas(["Oficina mecânica"]).size).toBeLessThan(4);
  });
});

describe("empresaServe — cidade e estado", () => {
  it("cidade com acento casa com a que o operador digitou sem", () => {
    expect(chaveDeCidade("Caçador")).toBe(chaveDeCidade("Cacador"));
    expect(
      empresaServe(
        daBase({ cidade: "Caçador", categoria: "Auto repair shop" }),
        criterio(["Oficina mecânica"], ["Cacador"]),
      ),
    ).toBe(true);
  });

  it("cidade diferente não entra, e cidade vazia também não", () => {
    expect(empresaServe(daBase({ cidade: "Caçador" }), criterio(["Borracharia"], ["Videira"]))).toBe(
      false,
    );
    expect(empresaServe(daBase({ cidade: "  " }), criterio(["Oficina mecânica"]))).toBe(false);
    expect(empresaServe(daBase({ cidade: null }), criterio(["Oficina mecânica"]))).toBe(false);
  });

  it("o estado só filtra quando a campanha declare um só", () => {
    const borracha = daBase({ estado: "sc", categoria: "Tire repair shop" });
    expect(empresaServe(borracha, criterio(["Borracharia"]))).toBe(true);
    expect(empresaServe({ ...borracha, estado: "PR" }, criterio(["Borracharia"]))).toBe(false);
    const duasUfs = criterioDaCampanha({
      cidades: [{ cidade: "Videira", estado: "SC" }, { cidade: "Curitiba", estado: "PR" }],
      categorias: ["Borracharia"],
    });
    expect(duasUfs.estado).toBeNull();
    expect(empresaServe({ ...borracha, estado: "PR", cidade: "Curitiba" }, duasUfs)).toBe(true);
  });
});

describe("criterioDaCampanha", () => {
  it("traduz as categorias UMA vez, e não por linha da base", () => {
    const c = criterioDaCampanha({ cidades: [{ cidade: "Videira" }], categorias: ["Oficina mecânica"] });
    expect(c.aceitas).toBeInstanceOf(Set);
    expect(c.aceitas?.has("auto repair shop")).toBe(true);
  });
});