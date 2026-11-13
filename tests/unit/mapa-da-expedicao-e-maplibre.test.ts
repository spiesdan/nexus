import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * O MAPA DA EXPEDIÇÃO É MAPLIBRE — E A TROCA NÃO PODE PERDER O QUE DOÍA.
 *
 * ## O que este arquivo vigia
 *
 * A decisão de trocar Leaflet por MapLibre está no ADR-0003 (que substitui o
 * ADR-0002). Migração de mapa é o tipo de mudança em que o compilador ajuda
 * pouco: os dois têm `Map`, `Marker` e `Popup`, então o código compila e o mapa
 * abre — só que sem enquadramento, sem popup com ação, ou sem "seguindo você".
 * Cada um desses comportamentos nasceu de um defeito medido em operação
 * (Pixel 7, cabine do entregador), e nenhum deles tem teste de browser neste
 * repo. O que dá para travar sem browser é a FORMA: se o comportamento sumir
 * do código, isto reprova.
 *
 * ## Por que o teste é de código-fonte, e não de render
 *
 * Porque o que se quer impedir é a REGRESSÃO SILENCIOSA na próxima edição do
 * arquivo — não provar que o MapLibre desenha (isso é o navegador). A prova
 * visual está em `docs/evidence/2026-11-13-expedicao/` e foi feita com os
 * componentes reais; o gate aqui é o que continua valendo depois.
 */
const RAIZ = process.cwd();
const MAPA = join(RAIZ, "app/app/expedicao/[id]/_mapa-rota.tsx");
const fonte = readFileSync(MAPA, "utf8");
const pkg = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

/** Remove comentários: o arquivo explica a migração citando `leaflet`. */
function semComentario(texto: string): string {
  return texto
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const CODIGO = semComentario(fonte);

describe("o mapa da expedição roda em MapLibre", () => {
  it("importa MapLibre e NÃO importa Leaflet", () => {
    expect(CODIGO, "o mapa da expedição não usa mais Leaflet").not.toMatch(
      /from "leaflet"|import\("leaflet"\)/,
    );
    expect(CODIGO, "o mapa da expedição tem de importar maplibre-gl").toMatch(
      /import\("maplibre-gl"\)/,
    );
    // O CSS é obrigatório: sem ele o canvas, os controles e os popups ficam
    // sem posicionamento e o mapa aparece empilhado no canto.
    expect(CODIGO).toContain('import "maplibre-gl/dist/maplibre-gl.css"');
  });

  it("o estilo vem de `lib/mapas/estilo`, não de um style remoto com chave", () => {
    expect(CODIGO).toContain("estiloOsm()");
    // Tile remoto com `style.json` de provedor pago é o que a decisão de
    // produto recusa (ADR-0003): sem chave, sem conta, sem cobrança.
    expect(CODIGO.toLowerCase()).not.toContain("mapbox://");
    expect(CODIGO.toLowerCase()).not.toContain("maptiler");
  });

  it("a geometria é calculada em `lib/mapas/geometria` — não no componente", () => {
    expect(CODIGO).toContain("linhaDeRota(");
    expect(CODIGO).toContain("poligonoDePrecisao(");
    expect(CODIGO).toContain("limitesDe(");
    // A conta do círculo de precisão tem de estar no helper testado, não
    // repetida aqui (era o jeito antigo: `L.circle` fazia por projeção).
    expect(CODIGO).not.toMatch(/111_?320/);
  });

  it("o enquadramento respeita o dedo: arrastou, não reenquadra", () => {
    expect(CODIGO).toContain("fitBounds(");
    expect(CODIGO).toContain("refArrastou");
    expect(CODIGO, "arrastar o mapa desliga o 'seguindo você'").toMatch(
      /on\("dragstart"[\s\S]{0,200}aoArrastar/,
    );
    // O modo navegação acompanha o motorista no zoom de rua.
    expect(CODIGO).toMatch(/easeTo\(\{[\s\S]{0,120}zoom: Math\.max\(m\.getZoom\(\), 15\)/);
  });

  it("o popup continua com as ações de entrega", () => {
    // O balão é criado a cada abertura: o ouvinte tem de ser ligado no `open`,
    // senão os botões "Cheguei"/"Entregue" param de funcionar em silêncio.
    expect(CODIGO).toMatch(/popup\.on\("open"/);
    expect(CODIGO).toContain('button[data-chave][data-acao]');
    expect(CODIGO).toContain("aoAcaoParada");
  });

  it("o pino do 'marcar no mapa' continua arrastável", () => {
    expect(CODIGO).toMatch(/draggable: opcoes\?\.arrastavel/);
    expect(CODIGO).toMatch(/\{ arrastavel: true \}/);
    expect(CODIGO).toMatch(/on\("dragend"[\s\S]{0,200}aoClicarMapa/);
  });

  it("o tamanho da caixa é observado e o mapa é destruído ao desmontar", () => {
    // ResizeObserver + resize(): sem isso o mapa nasce com 0px de altura,
    // enquadra "nada" e abre num quarteirão só.
    expect(CODIGO).toContain("ResizeObserver");
    expect(CODIGO).toContain("m.resize()");
    // StrictMode monta/desmonta em dev; sem `remove()`, a segunda montagem
    // herda o contêiner sujo e o mapa nasce morto.
    expect(CODIGO).toContain(".remove()");
  });

  it("mantém o stacking context próprio do contêiner", () => {
    expect(CODIGO).toMatch(/relative isolate z-0/);
  });
});

describe("o pacote e o resto do repo", () => {
  it("maplibre-gl é dependência de runtime declarada", () => {
    expect(pkg.dependencies?.["maplibre-gl"]).toBeTruthy();
  });

  it("Leaflet fica só na prospecção — a expedição não pode voltar atrás", () => {
    const achados: string[] = [];
    const varrer = (dir: string) => {
      for (const entrada of readdirSync(dir)) {
        if (new Set(["node_modules", ".next", ".git", "graphify-out"]).has(entrada)) continue;
        const caminho = join(dir, entrada);
        if (statSync(caminho).isDirectory()) {
          varrer(caminho);
          continue;
        }
        if (!/\.tsx?$/.test(entrada)) continue;
        const texto = readFileSync(caminho, "utf8");
        if (/from "leaflet"|import\("leaflet"\)/.test(texto)) {
          achados.push(relative(RAIZ, caminho));
        }
      }
    };
    for (const dir of ["app", "lib", "components"]) varrer(join(RAIZ, dir));
    // Guarda de vácuo: se a varredura parar de achar a prospecção, ela parou
    // de olhar o repo — e passaria verde sem medir nada.
    expect(achados).toContain("app/app/prospeccao/_mapa.tsx");
    expect(achados.filter((c) => c.startsWith("app/app/expedicao/"))).toEqual([]);
  });
});
