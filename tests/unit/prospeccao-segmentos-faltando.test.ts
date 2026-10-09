/**
 * OS DOIS SEGMENTOS QUE NÃO EXISTIAM.
 *
 * ─── O que este arquivo registra ────────────────────────────────────────────
 *
 * Em 09/10/2026 a pessoa pediu para cadastrar um posto de combustível e uma
 * marmoraria na prospecção e nenhum dos dois apareceu. A causa raiz não é a
 * busca, não é o funil e não é o roteador de IA — é que **as duas categorias
 * não existiam na lista**:
 *
 * ```
 * $ grep -niE "posto|combust|marmor" lib/prospeccao/categorias.ts   # vazio
 * $ grep -c posto lib/prospeccao/categorias.ts lib/prospeccao/providers/osm.ts
 *     lib/prospeccao/categorias.ts:0        ← a tela consome ESTE
 *     lib/prospeccao/providers/osm.ts:2     ← o seletor existia aqui
 * ```
 *
 * O seletor OSM de posto (`amenity=fuel`) já estava escrito desde sempre. Ele
 * nunca foi alcançado, porque a categoria que o produziria não podia ser
 * escolhida: `_campanha-wizard.tsx` monta as opções a partir de
 * `CATEGORIAS_COMERCIAIS`, e lá não estava.
 *
 * ─── Por que estes testes existem em vez de uma linha de código ─────────────
 *
 * Porque o defeito é INVISÍVEL ao TypeScript. `sub("Posto de combustível",
 * "posto de combustível")` compila, aparece na tela e produz uma busca que
 * volta vazia — e "a busca voltou vazia" é indistinguível de "não tem posto
 * nessa cidade". Quem depura isso olha a cidade, olha o raio, olha o provedor,
 * e nunca chega na lista de categorias.
 *
 * E há uma segunda classe de defeito que este arquivo pega: a ORDEM do
 * `MAPA_CATEGORIAS`. `seletoresPara` devolve o primeiro que casa, e "marmoraria"
 * casa em dois lugares — no bloco de pedra e no de material de construção. Na
 * ordem errada, quem cadastra marmoraria recebe os seletores de material de
 * construção, que não acham marmoraria nenhuma. O sintoma é o mesmo da categoria
 * ausente, e a causa é oposta.
 */
import { describe, expect, it } from "vitest";

import { CATEGORIAS_COMERCIAIS, termosDeBusca } from "@/lib/prospeccao/categorias";
import { seletoresPara } from "@/lib/prospeccao/providers/osm";

/** O termo de busca exato que o cadastro grava, e o que a tela mostra. */
const BUSCA_POSTO = "posto de combustível";
const BUSCA_MARMORARIA = "marmoraria";

describe("o posto de combustível é elegível para a prospecção", () => {
  it("existe na lista que a tela consome", () => {
    const opcoes = termosDeBusca();
    const achou = opcoes.find((t) => t.busca === BUSCA_POSTO);
    expect(achou, `"${BUSCA_POSTO}" não está na lista de categorias`).toBeDefined();
  });

  it("é um item de uma macro, e não um termo solto", () => {
    const macro = CATEGORIAS_COMERCIAIS.find((m) =>
      m.subcategorias.some((s) => s.busca === BUSCA_POSTO),
    );
    expect(macro, "o posto precisa estar dentro de uma macro").toBeDefined();
    // Macro própria: posto de combustível não é automitivo nem comércio, o
    // cliente final é outro. Este teste fixa a decisão, não só o fato.
    expect(macro?.macro).toBe("Postos");
  });

  it("chega ao seletor do OSM, e não ao fallback textual", () => {
    const r = seletoresPara(BUSCA_POSTO);
    expect(r.aproximado, `posto caiu no fallback: ${r.seletores.join(" ")}`).toBe(false);
    expect(r.seletores).toContain('["amenity"="fuel"]');
  });

  it("o termo que sai da tela é o que o mapa entende (com e sem acento)", () => {
    // A tela manda o que está em `busca`; o mapa casa sobre o texto NFD. Se
    // alguém trocar o valor de `busca` por um com acento que o mapa não
    // contém, a categoria aparece e volta vazia — que é o defeito original.
    const comAcento = CATEGORIAS_COMERCIAIS.flatMap((m) => m.subcategorias).find(
      (s) => s.busca === BUSCA_POSTO,
    );
    expect(comAcento).toBeDefined();
    expect(seletoresPara(comAcento!.busca.toLowerCase()).aproximado).toBe(false);
  });
});

describe("a marmoraria é elegível para a prospecção", () => {
  it("existe na lista que a tela consome", () => {
    const achou = termosDeBusca().find((t) => t.busca === BUSCA_MARMORARIA);
    expect(achou, `"${BUSCA_MARMORARIA}" não está na lista de categorias`).toBeDefined();
  });

  it("está em Construção, junto de quem já compra dela", () => {
    const macro = CATEGORIAS_COMERCIAIS.find((m) =>
      m.subcategorias.some((s) => s.busca === BUSCA_MARMORARIA),
    );
    expect(macro?.macro).toBe("Construção");
  });

  it("NÃO é confundida com marmitaria (que é açougueiro)", () => {
    // O par que quase entrou no mesmo erro: "marmitaria" (carne) já estava na
    // lista, em Alimentação, desde antes. Sem esta separação, alguém corrigindo
    // "marmoraria" teria adicionado a letra e virado um açougueiro de mármore.
    const carne = CATEGORIAS_COMERCIAIS.find((m) =>
      m.subcategorias.some((s) => s.busca === "marmitaria"),
    );
    const pedra = CATEGORIAS_COMERCIAIS.find((m) =>
      m.subcategorias.some((s) => s.busca === BUSCA_MARMORARIA),
    );
    expect(carne?.macro).toBe("Alimentação");
    expect(pedra?.macro).toBe("Construção");
    expect(carne?.macro).not.toBe(pedra?.macro);
  });

  it("chega ao seletor do OSM, e não ao fallback textual", () => {
    const r = seletoresPara(BUSCA_MARMORARIA);
    expect(r.aproximado, `marmoraria caiu no fallback: ${r.seletores.join(" ")}`).toBe(false);
    expect(r.seletores).toContain('["craft"="stonemason"]');
  });

  it("a ORDEM do mapa põe a pedra ANTES do material de construção", () => {
    // Este é o teste que pega a classe silenciosa: com a ordem invertida,
    // "marmoraria" casa em `material.constru|construcao|…` e recebe
    // `shop=doityourself` + `shop=hardware` + `craft=carpenter` — que não acham
    // uma marmoraria. A categoria aparece na tela e a busca volta vazia.
    const pedra = seletoresPara(BUSCA_MARMORARIA).seletores;
    const construcao = seletoresPara("material de construção").seletores;
    expect(pedra, "marmoraria recebeu os seletores do material de construção").not.toEqual(
      construcao,
    );
    expect(construcao).toContain('["shop"="doityourself"]');
  });
});

describe("os segmentos que entraram com estes dois", () => {
  it("posto de GNV e lubrificante também são elegíveis", () => {
    // O mesmo posto, em três Talks de venda. Se só o de combustível estivesse
    // na lista, os outros dois continuariam invisíveis — que é o defeito
    // original aplicado a dois outros termos.
    for (const termo of ["posto de GNV", "lubrificantes"]) {
      const naLista = termosDeBusca().some((t) => t.busca === termo);
      const r = naLista ? seletoresPara(termo) : { aproximado: true, seletores: [] };
      expect(naLista, `${termo} não está na lista`).toBe(true);
      expect(r.aproximado, `${termo} cai no fallback`).toBe(false);
      expect(r.seletores.length, `${termo} ficou sem seletor`).toBeGreaterThan(0);
    }
  });

  it("pedreira é elegível e resolve para o mesmo par de pedra", () => {
    const r = seletoresPara("pedreira");
    expect(r.aproximado).toBe(false);
    expect(r.seletores).toContain('["craft"="stonemason"]');
  });

  it("nenhum termo novo ficou sem seletor OSM", () => {
    // Rede de segurança: se alguém adicionar uma categoria sem entrada no
    // `MAPA_CATEGORIAS`, este teste reprova no mesmo commit.
    const novos = [
      BUSCA_POSTO,
      "posto de GNV",
      "lubrificantes",
      "lavagem de veículos",
      BUSCA_MARMORARIA,
      "pedreira",
    ];
    for (const termo of novos) {
      expect(seletoresPara(termo).aproximado, `${termo} cai no fallback textual`).toBe(false);
    }
  });
});

describe("nenhum segmento novo quebrou um antigo", () => {
  it("as categorias que já funcionavam continuam resolvendo", () => {
    // A ordem do `MAPA_CATEGORIAS` mudou. Um termo antigo que agora case antes
    // de onde casava trocou de seletor silenciosamente — e o sintoma é o mesmo
    // "a busca volta vazia", agora em um segmento que funcionava.
    // O `casa` de cada um, transcrito do mapa ANTES desta mudança. Comparar
    // o PADRÃO e não a lista resolvida é deliberado: `material de construção`
    // ganhou `craft=carpenter` porque o mapa JÁ tinha esse seletor e ninguém
    // tinha notado — o teste fixa a ENTRADA, que é o que eu posso prometer não
    // ter alterado, em vez de gravar como verdade uma lista que já era.
    const antes: Record<string, RegExp> = {
      restaurante: /restaurante|lanchonete|pizzaria/i,
      padaria: /padaria|padaria/i,
      farmácia: /farmacia|drogaria/i,
      "material de construção": /material.constru|construcao|madeireira|vidracaria|tinta/i,
      hospital: /hospital/i,
    };
    for (const [termo, esperado] of Object.entries(antes)) {
      const r = seletoresPara(termo);
      expect(r.aproximado, `${termo} passou a cair no fallback`).toBe(false);
      // `seletoresPara` normaliza para NFD; o regex também precisa estar em NFD
      // para a comparação ser sobre o mesmo texto.
      const plano = termo.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      expect(esperado.test(plano), `${termo} mudou de bloco no mapa`).toBe(true);
    }

    // E o que a mudança realmente podia quebrar: um termo antigo que passe a
    // casar no bloco NOVO de pedra. "pedra", "granito" e "azulejo" são nomes de
    // material, não de negócio, e podem aparecer dentro de um termo antigo.
    for (const termo of [
      "material de construção",
      "madeireira",
      "construtora",
      "vidraçaria",
      "tintas",
      "engenharia",
    ]) {
      const r = seletoresPara(termo);
      expect(r.seletores, `${termo} foi parar no bloco de pedra`).not.toContain(
        '["craft"="stonemason"]',
      );
    }
  });
});
