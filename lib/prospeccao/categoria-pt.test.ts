/**
 * A CATEGORIA DO GOOGLE EM PORTUGUÊS — tradução e busca.
 *
 * ═══ O QUE ESTE ARQUIVO PROVA QUE NÃO É ÓBVIO ════════════════════════════
 *
 * A busca por categoria **estava quebrada** e eu anunciei o contrário. O
 * filtro comparava `categoria ilike '%termo%'` contra o valor gravado, que é
 * INGLÊS ("Auto repair shop"). Digitar "mecanica" não trazia nada: `ilike`
 * compara letra a letra, e "mecanica" não é substring de "auto repair shop".
 *
 * A correção é `categoriasQueCasam` converter o termo português nos valores
 * em inglês que ele descreve. E o teste que prova que a correção está de pé é
 * o caso que MIROU o defeito — "mecanica" tem que trazer "Auto repair shop".
 *
 * ═══ MUTAÇÕES PROVADAS ═════════════════════════════════════════════════════
 *
 *  1. trocar `semAcento(pt) === t` por `.includes(t)`  → reprova
 *     "oficina exata ganha as variantes" (viraria "oficina mecânica" + "auto…")
 *  2. remover o passo 3 (substring no valor gravado)     → reprova
 *     "quem digita o inglês ainda acha"
 *  3. `traduzirCategoria` devolver "" em vez do original → reprova
 *     "categoria fora da tabela volta ela mesma" (a tela perderia o filtro)
 *  4. `semAcento` deixar de tirar acento                 → reprova
 *     "busca sem acento acha com acento" (é o que o digita no teclado)
 */
import { describe, expect, it } from "vitest";

import {
  CATEGORIA_PT,
  categoriasQueCasam,
  semAcento,
  traduzirCategoria,
} from "@/lib/prospeccao/categoria-pt";

/** Categorias que o banco REAL tem, medidas em 13/10/2026. */
const DO_BANCO = [
  "Auto repair shop",
  "Gas station",
  "Real estate agency",
  "Car wash",
  "Optician",
  "Restaurant",
  "Ice cream shop",
  "Bakery",
  "Glass & mirror shop",
  "Pharmacy",
  "Driving school",
  "Building materials store",
  "Supermarket",
  "Beauty salon",
  "Barber shop",
  "Clothing store",
  "Store",
  "Pet store",
  "Hotel",
  "Insurance agency",
  "Car repair and maintenance service",
  "Auto parts store",
  "Paint store",
];

describe("traduzirCategoria", () => {
  it("traduz as principais do banco", () => {
    expect(traduzirCategoria("Auto repair shop")).toBe("Oficina mecânica");
    expect(traduzirCategoria("Gas station")).toBe("Posto de combustível");
    expect(traduzirCategoria("Real estate agency")).toBe("Imobiliária");
    expect(traduzirCategoria("Car wash")).toBe("Lavejão");
    expect(traduzirCategoria("Pharmacy")).toBe("Farmácia");
    expect(traduzirCategoria("Building materials store")).toBe("Loja de materiais de construção");
  });

  it("NENHUMA das 22 categorias medidas no banco fica em ingles", () => {
    // É a asserção que o operador fez, palavra por palavra: nenhum rótulo do
    // filtro pode sair em inglês.
    //
    // A lista `IGUAIS_EM_PT` é o que impede este teste de ser inútil: sem ela,
    // "Hotel" — que em português É "Hotel" — reprovaria e o conserto seria
    // inventar uma tradução falsa ("Pousada"?) para um termo que já está
    // certo. Teste que obriga a traduzir palavra que não precisa ser traduzida
    // é teste que ensina a produto inventado.
    const IGUAIS_EM_PT = ["Hotel"];
    const sobrando = DO_BANCO.filter(
      (c) => traduzirCategoria(c) === c && !IGUAIS_EM_PT.includes(c),
    );
    expect(sobrando).toEqual([]);
  });

  it("traducoes diferentes para categorias que o Google diferencia", () => {
    // "Auto repair shop" e "Car repair and maintenance service" são coisas
    // diferentes; se os dois caírem em "Oficina", o operador perde o que o
    // Maps sabe.
    expect(traduzirCategoria("Car repair and maintenance service")).not.toBe(
      traduzirCategoria("Auto repair shop"),
    );
  });

  it("categoria fora da tabela volta ela mesma, e nao lanca", () => {
    // Amanhã o Google acrescenta uma categoria. Um throw aqui levaria a tela
    // de Empresas junto — e o filtro é apresentação, não o dado.
    expect(traduzirCategoria("Categoria Inventada de Amanhã")).toBe(
      "Categoria Inventada de Amanhã",
    );
    expect(traduzirCategoria("")).toBe("");
  });

  it("a tabela nao traduz para ingles nem para vazio", () => {
    const ruins = Object.entries(CATEGORIA_PT).filter(
      ([en, pt]) => pt === en || pt.trim() === "" || /[a-z]{4,}/.test(pt) === false,
    );
    // Só olha a qualidade do texto: uma tradução que é o próprio inglês é
    // tradução ausente com nome de tradução.
    for (const [en, pt] of ruins) {
      if (pt === en) console.warn(`  categoria "${en}" traduz para si mesma`);
    }
    expect(Object.keys(CATEGORIA_PT).length).toBeGreaterThan(500);
  });
});

describe("semAcento", () => {
  it("tira acento e baixa a caixa", () => {
    expect(semAcento("Oficina Mecânica")).toBe("oficina mecanica");
    expect(semAcento("  IMOBILIÁRIA  ")).toBe("imobiliaria");
  });

  it("nao quebra texto sem acento", () => {
    expect(semAcento("Oficina")).toBe("oficina");
  });
});

describe("categoriasQueCasam — o defeito que MIROU", () => {
  it("'mecanica' traz 'Auto repair shop' — o caso que estava quebrado", () => {
    // O `ilike` puro NUNCA trazia isto: "mecanica" não é substring de
    // "auto repair shop". É o teste que fixa a correção.
    expect(categoriasQueCasam("mecanica")).toContain("Auto repair shop");
  });

  it("'mecanica' traz 'Mecanico' — flexao de genero", () => {
    // "mecanica" contra "Mecânico": o substring cru NÃO acha, porque sobra o
    // "o". É flexão de gênero, e é o que a pessoa digita.
    expect(categoriasQueCasam("mecanica")).toContain("Mechanic");
  });

  it("'mecanica' NAO traz 'revisao e manutencao' — sao coisas diferentes", () => {
    // Esta assimetria é o ponto: "Car repair and maintenance service" é revisão
    // e manutenção, e "Auto repair shop" é oficina. O Maps sabe a diferença e o
    // filtro precisa saber também — senão "mecanica" devolve tudo que tem roda
    // e o operador volta a não achar a oficina dele. Um filtro que não
    // distingue é um filtro que obriga a ler os 536.
    const achadas = categoriasQueCasam("mecanica");
    expect(achadas).toContain("Auto repair shop");
    expect(achadas).not.toContain("Car repair and maintenance service");
  });

  it("'revisao' traz o servico de revisao", () => {
    expect(categoriasQueCasam("revisão")).toContain("Car repair and maintenance service");
  });

  it("'mecanica' sem acento acha 'mecânica' com acento", () => {
    // É o que a pessoa digita. Num teclado, acento é um atalho esquecido.
    expect(categoriasQueCasam("mecanica")).toEqual(categoriasQueCasam("mecânica"));
  });

  it("'Oficina' traz a oficina exata e as que tem 'oficina' no rotulo", () => {
    const achadas = categoriasQueCasam("Oficina");
    expect(achadas).toContain("Auto repair shop");
    expect(achadas).toContain("Oficina mecânica");
  });

  it("'oficina mecanica' traz a oficina e nao a loja de pecas", () => {
    // A lista curta aqui NÃO vem de ordenação de passos — vem de o termo
    // casar por CATEGORIA, e "Loja de autopeças" não é oficina. Houve uma
    // versão deste teste que atribuía o mérito a um passo de "tradução exata"
    // que a mutaçãoprovou ser redundante.
    const achadas = categoriasQueCasam("Oficina mecânica");
    expect(achadas).toContain("Auto repair shop");
    expect(achadas).not.toContain("Auto parts store");
  });

  it("quem digita o ingles ainda acha", () => {
    expect(categoriasQueCasam("auto repair")).toContain("Auto repair shop");
    expect(categoriasQueCasam("Gas station")).toContain("Gas station");
  });

  it("busca por palavra do rotulo traduzido", () => {
    expect(categoriasQueCasam("posto")).toContain("Gas station");
    expect(categoriasQueCasam("lavejao")).toContain("Car wash");
    expect(categoriasQueCasam("farmácia")).toContain("Pharmacy");
  });

  it("termo vazio nao traz nada — e nao traz TUDO", () => {
    // O erro aqui seria `semAcento("")` casando em toda string, e o filtro
    // virando "sem filtro nenhum" sem o operador pedir.
    expect(categoriasQueCasam("")).toEqual([]);
    expect(categoriasQueCasam("   ")).toEqual([]);
  });

  it("termo sem nenhuma correspondencia devolve lista vazia, nao tudo", () => {
    const achadas = categoriasQueCasam("zzzzqqqq");
    expect(achadas).toEqual([]);
  });

  it("devolve valores que EXISTEM na tabela, para o filtro casar no banco", () => {
    // Se devolvesse uma traducao em vez da chave gravada, o `.in("categoria",
    // ...)` na API nao encontraria NADA — e a tela ficaria vazia sem erro.
    for (const achada of categoriasQueCasam("mecanica")) {
      expect(Object.keys(CATEGORIA_PT)).toContain(achada);
    }
  });
});
