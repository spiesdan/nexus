/**
 * A CATEGORIA EFETIVA — os casos reais que o operador apontou.
 *
 * Cada teste usa um nome que existe na instalação de produção (ou o molde
 * dele) para provar que a correção não é hipotética: "Estação Café - Loja
 * Posto Carretão II" é um café dentro do posto, "Posto Ipiranga" é um posto
 * que o Google classificou como oficina, "Branca" é um posto sem evidência no
 * nome e por isso NÃO pode ser usado em campanha até alguém olhar.
 */
import { describe, expect, it } from "vitest";

import {
  categoriaCombinaComCampanha,
  categoriaEfetiva,
  categoriasAceitas,
} from "@/lib/prospeccao/categoria-efetiva";

const posto = (nome: string, over: Partial<Parameters<typeof categoriaEfetiva>[0]> = {}) =>
  categoriaEfetiva({ nome, categoria: "Gas station", categorias: ["Gas station"], ...over });

describe("categoriaEfetiva — o nome desmente o rótulo do Google", () => {
  it("café dentro do posto não é posto", () => {
    const c = posto("Estação Café - Loja Posto Carretão II");
    expect(c.rotulo).toBe("Café");
    expect(c.revisar).toBe(false);
    expect(c.reclassificada).toBe(true);
    expect(categoriaCombinaComCampanha(c, ["Posto de combustível"])).toBe(false);
    expect(categoriaCombinaComCampanha(c, ["Café"])).toBe(true);
    expect(categoriaCombinaComCampanha(c, ["Cafeteria"])).toBe(true);
  });

  it("posto de saúde não é posto de combustível", () => {
    const c = posto("Posto de Saúde Central");
    expect(c.rotulo).toBe("Centro público de saúde");
    expect(categoriaCombinaComCampanha(c, ["Posto de combustível"])).toBe(false);
  });

  it("lava-jato e posto de molas não são postos", () => {
    expect(posto("Posto de Lavação São José").rotulo).toBe("Lavejão");
    expect(posto("Posto de Molas do Zé").rotulo).toBe("Oficina mecânica");
  });

  it("loja/conveniência no nome não é posto", () => {
    const c = posto("Loja Posto Carretão");
    expect(c.rotulo).toBe("Mercearia de bairro");
    expect(categoriaCombinaComCampanha(c, ["Posto de combustível"])).toBe(false);
  });
});

describe("categoriaEfetiva — o nome confirma o posto", () => {
  it("posto com nome/bandeira continua posto e entra na campanha", () => {
    for (const nome of ["Posto 1º de Maio", "Auto Posto Videira", "Posto Ipiranga Centro"]) {
      const c = posto(nome);
      expect(c.rotulo).toBe("Posto de combustível");
      expect(c.revisar).toBe(false);
      expect(categoriaCombinaComCampanha(c, ["Posto de combustível"])).toBe(true);
    }
  });

  it("website de bandeira confirma mesmo com nome estranho", () => {
    // "Auto Desk Leblon" está na base com site shell.com.br: é posto.
    const c = posto("Auto Desk Leblon", { website: "https://www.shell.com.br/" });
    expect(c.rotulo).toBe("Posto de combustível");
    expect(c.revisar).toBe(false);
    expect(c.confianca).toBe("alta");
  });

  it("Google diz posto, mas nada confirma: revisar, não adivinhar", () => {
    // "Branca" e "Ellg" existem na base sem site e sem sinal no nome. Podem ser
    // postos — mas a campanha não aposta: a linha vai para revisão.
    for (const nome of ["Branca", "Ellg"]) {
      const c = posto(nome, { categorias: [] });
      expect(c.rotulo).toBe("Posto de combustível");
      expect(c.revisar).toBe(true);
      expect(c.confianca).toBe("baixa");
      expect(categoriaCombinaComCampanha(c, ["Posto de combustível"])).toBe(false);
    }
  });

  it("secundária que só repete o primário não confirma posto", () => {
    // O Google repete "Gas station" nas secundárias. Isso não é evidência
    // independente; sem nome/site, a linha continua em revisão.
    const c = posto("Branca", { categorias: ["Gas station"] });
    expect(c.revisar).toBe(true);
  });

  it("posto classificado como oficina é corrigido pelo nome", () => {
    const c = categoriaEfetiva({
      nome: "Posto Ipiranga",
      categoria: "Auto repair shop",
      categorias: ["Auto repair shop"],
    });
    expect(c.rotulo).toBe("Posto de combustível");
    expect(c.reclassificada).toBe(true);
    expect(categoriaCombinaComCampanha(c, ["Oficina mecânica"])).toBe(false);
    expect(categoriaCombinaComCampanha(c, ["Posto de combustível"])).toBe(true);
  });
});

describe("categoriaEfetiva — genéricas e desconhecidas", () => {
  it("Store com secundária específica usa a secundária", () => {
    const c = categoriaEfetiva({
      nome: "Veste Bem",
      categoria: "Store",
      categorias: ["Clothing store"],
    });
    expect(c.revisar).toBe(false);
    expect(c.rotulo).toBe("Loja de roupas");
  });

  it("Store sem secundária vai para revisão", () => {
    const c = categoriaEfetiva({ nome: "Loja do Bairro", categoria: "Store", categorias: [] });
    expect(c.revisar).toBe(true);
    expect(categoriaCombinaComCampanha(c, ["Loja"])).toBe(false);
  });

  it("sem categoria nenhuma vai para revisão", () => {
    const c = categoriaEfetiva({ nome: "Sem Categoria", categoria: null, categorias: null });
    expect(c.revisar).toBe(true);
    expect(c.rotulo).toBe("Não classificado");
  });

  it("categoria específica conhecida fica como está e entra na campanha", () => {
    const c = categoriaEfetiva({
      nome: "Auto Peças Videira",
      categoria: "Auto parts store",
      categorias: [],
    });
    expect(c.rotulo).toBe("Loja de autopeças");
    expect(c.revisar).toBe(false);
    expect(categoriaCombinaComCampanha(c, ["Autopeças"])).toBe(true);
  });
});

describe("categoriaCombinaComCampanha", () => {
  it("o curinga histórico 'empresas' não filtra categoria, mas revisar continua vetado", () => {
    const normal = categoriaEfetiva({
      nome: "Mecânica Videira",
      categoria: "Auto repair shop",
      categorias: [],
    });
    expect(categoriaCombinaComCampanha(normal, ["empresas"])).toBe(true);
    expect(categoriaCombinaComCampanha(normal, [])).toBe(true);

    const revisar = categoriaEfetiva({ nome: "Branca", categoria: "Gas station", categorias: [] });
    expect(categoriaCombinaComCampanha(revisar, ["empresas"])).toBe(false);
  });

  it("comparação usa as duas línguas e ignora acento", () => {
    const c = categoriaEfetiva({
      nome: "Auto Peças Videira",
      categoria: "Auto parts store",
      categorias: [],
    });
    expect(categoriaCombinaComCampanha(c, ["autopecas"])).toBe(true);
    expect(categoriaCombinaComCampanha(c, ["Auto parts store"])).toBe(true);
  });

  it("categoriasAceitas é a mesma régua do público da campanha", () => {
    const aceitas = categoriasAceitas(["Oficina mecânica"]);
    expect(aceitas.has("auto repair shop")).toBe(true);
    expect(aceitas.has("oficina mecanica")).toBe(true);
  });
});
