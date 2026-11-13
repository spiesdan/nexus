import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A PÁGINA DE ROTA É: MAPA EM CIMA, PAINÉIS ABAIXO.
 *
 * ## O defeito que este gate tranca
 *
 * A página nasceu em três colunas, com o mapa espremido no meio. Quando
 * entraram a distribuição por veículo (F5) e a recuperação de endereços (0309),
 * cada cartão virou um item solto do grid: com cinco itens e três colunas, dois
 * deles caíram numa SEGUNDA linha, largos, embaixo do mapa. A rota — razão da
 * tela — virou a menor coisa nela, e a página terminava num bloco de cartões
 * fora de qualquer coluna.
 *
 * ## A forma decidida
 *
 *   1. cabeçalho da seção;
 *   2. faixa de números (entregas, no mapa, distância, tempo, mercadorias);
 *   3. o MAPA, em cima e largo;
 *   4. os painéis, abaixo: ordem de entrega | planejamento | recuperação e
 *      distribuição.
 *
 * O teste mede essa ORDEM no arquivo e as classes que a produzem. Não é pixel
 * (isso é a prova visual em `evidence/`): é a estrutura que faz o pixel sair
 * certo, e que uma edição futura desfaria em silêncio.
 */
const RAIZ = process.cwd();
const FONTE = readFileSync(join(RAIZ, "app/app/expedicao/[id]/_roteirizador.tsx"), "utf8");
const DIR = join(RAIZ, "app/app/expedicao/[id]");

/** Posição do primeiro trecho que casa, ou -1. */
function onde(trecho: string | RegExp, aPartirDe = 0): number {
  const i = FONTE.slice(aPartirDe).search(trecho);
  return i < 0 ? -1 : aPartirDe + i;
}

describe("página de rota — mapa grande em cima, painéis abaixo", () => {
  it("o cabeçalho da seção tem o peso do cabeçalho de seção da ficha", () => {
    // A ficha da carga já tem um `h1` (o número). Esta seção usa `h2` com o
    // mesmo tamanho da seção "Paradas" (`text-base`): um segundo título de
    // 24px competiria com o da página.
    expect(FONTE).toMatch(
      /<h2 className="text-base font-medium text-text">\{t\("Mapa e ordem de entrega"\)\}/,
    );
  });

  it("a faixa de números vem antes do mapa", () => {
    const faixa = onde(/grid grid-cols-2 overflow-hidden rounded-2xl/);
    const mapa = onde("<MapaRota");
    expect(faixa, "a faixa de instrumentos some sem aviso").toBeGreaterThan(-1);
    expect(mapa).toBeGreaterThan(faixa);
  });

  it("o mapa é largo e alto: não é coluna de grid nem tem altura de cartão", () => {
    const mapa = onde("<MapaRota");
    const trecho = FONTE.slice(mapa, mapa + 300);

    // Largo: o `MapaRota` não pode estar dentro de um grid de colunas fixas.
    expect(trecho).not.toMatch(/grid-cols-\[/);
    // Alto: a altura é dada em vh, não em pixel de cartão.
    const altura = /altura="([^"]+)"/.exec(trecho)?.[1] ?? "";
    expect(altura, "o mapa precisa de altura explícita").not.toBe("");
    expect(altura).toMatch(/vh/);
    expect(Number(/(\d+)vh/.exec(altura)?.[1] ?? 0)).toBeGreaterThanOrEqual(50);
  });

  it("os painéis vêm DEPOIS do mapa, num grid próprio", () => {
    const mapa = onde("<MapaRota");
    const paineis = onde(/OS PAINÉIS, ABAIXO DO MAPA/);
    expect(paineis).toBeGreaterThan(mapa);
    // O grid dos painéis é declarado no mesmo bloco, e não envolve o mapa.
    const trecho = FONTE.slice(paineis, paineis + 600);
    expect(trecho).toMatch(/grid grid-cols-1[\s\S]{0,200}xl:grid-cols-3/);
  });

  it("não existe coluna de mapa no grid: mapa e painéis não disputam a mesma linha", () => {
    // A assinatura do defeito original era o grid de três colunas com o mapa
    // como item do meio (`minmax(0,1fr)` entre duas colunas de 360px).
    expect(FONTE).not.toMatch(/grid-cols-\[minmax\(0,360px\)_minmax\(0,1fr\)_minmax\(0,360px\)\]/);
  });

  it("a ordem de entrega abre os painéis (é por onde se trabalha)", () => {
    const paineis = onde(/OS PAINÉIS, ABAIXO DO MAPA/);
    const ordem = onde(/A ordem de entrega/, paineis);
    expect(ordem).toBeGreaterThan(paineis);
    expect(FONTE.slice(ordem, ordem + 200)).toMatch(/order-first/);
  });

  it("os cartões de trabalho não pedem coluna ao grid da página", () => {
    // Dentro de um painel, `xl:order-N` não posiciona nada: só confunde quem
    // procura o dono do lugar. Era assim que cada cartão virava item solto.
    // A varredura cobre a pasta inteira: o painel de recuperação mora em outro
    // arquivo, e era lá que vivia o `xl:order-4` do defeito original.
    const arquivos = readdirSync(DIR).filter((f) => f.endsWith(".tsx"));
    const achados = arquivos.flatMap((arquivo) => {
      const texto = readFileSync(join(DIR, arquivo), "utf8");
      return [...texto.matchAll(/xl:order-\d+/g)].map((m) => `${arquivo}: ${m[0]}`);
    });
    expect(achados, "nenhum cartão deve pedir coluna ao grid").toEqual([]);
  });
});
