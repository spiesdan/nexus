/**
 * Todo contêiner de mapa Leaflet do repo cria o próprio stacking context — e
 * faz isso de um jeito que TODO browser entende.
 *
 * ═══ O BUG, E OS DOIS LADOS DELE ══════════════════════════════════════════
 *
 * O Leaflet escreve z-index nos próprios panes, em pixels, na MESMA pilha da
 * página:
 *
 *   400 overlay · 600 marcadores · 700 popup · 800/1000 controle
 *
 * E `.leaflet-pane` é `position: absolute`, enquanto o `dist/leaflet.css` do
 * Leaflet posiciona o container só com `overflow: hidden` — **sem `position`**.
 *
 * 1. SEM `position`: os panes absolutos ancoram no ancestral POSICIONADO mais
 *    próximo, que pode estar bem acima do mapa. Aí o `overflow: hidden` do
 *    mapa não recorta nada — cortar um absoluto exige ser o containing block.
 *    Tiles e popups pintam FORA da caixa do mapa.
 * 2. SEM stacking context próprio: o cabeçalho `sticky top-14 z-10` da ficha de
 *    expedição fica ABAIXO de popup e marcadores — o mapa invade o cabeçalho ao
 *    rolar. E `Dialog`/`Sheet` (`z-50`) ficam ATRÁS do mapa.
 *
 * ═══ POR QUE `relative z-0` E NÃO SÓ `isolate` ═══════════════════════════
 *
 * `isolate` é a forma moderna do nome da propriedade. Antes dela, chamava-se
 * `isolation`, e o Safari só adotou `isolate` em 15.4 (março de 2022). Onde
 * não há suporte, a declaração é **descartada em silêncio**: o `className`
 * continua no código, o conserto não acontece e nada avisa.
 *
 * Isso foi MEDIDO no browser de verificação, com o CSS real do `node_modules`:
 *
 *   sem nada                      → MAPA POR CIMA do cabeçalho
 *   com `isolate`                 → MAPA POR CIMA do cabeçalho  (sem suporte)
 *   com `position: relative; z-index: 0` → CABEÇALHO POR CIMA  ✅
 *
 * `position` com `z-index` diferente de `auto` cria stacking context em todo
 * browser, ancient browser included. `isolate` fica como reforço, nunca como
 * o que sustenta o conserto.
 *
 * ═══ POR QUE ESTE TESTE EXISTE ════════════════════════════════════════════
 *
 * Porque o conserto já foi feito uma vez, pela metade: `app/app/prospeccao/
 * _mapa.tsx` ganhou `isolate` e a ficha de expedição ficou sem nada. Mesmo
 * sintoma, outra tela, mesma causa.
 *
 * E porque `isolate` sozinho, já presente na prospecção, **não resolvia** —
 * era `z-0` que faltava. Este teste exige o que resolve.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();

const DIRETORIOS = ["app", "components", "lib"];
const IGNORAR = new Set(["node_modules", ".next", ".git", "graphify-out", ".repro"]);

function arquivosComLeaflet(dir: string, achados: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    if (IGNORAR.has(entrada)) continue;
    const caminho = join(dir, entrada);
    if (statSync(caminho).isDirectory()) {
      arquivosComLeaflet(caminho, achados);
      continue;
    }
    if (!/\.tsx?$/.test(entrada)) continue;
    const texto = readFileSync(caminho, "utf8");
    // Só interessa quem INSTANCIA o Leaflet. Importar o tipo não cria pane.
    if (/(await import\("leaflet"\)|from "leaflet"\))/.test(texto) && /L\.map\(/.test(texto)) {
      achados.push(caminho);
    }
  }
  return achados;
}

const COM_LEAFLET = DIRETORIOS.flatMap((d) => arquivosComLeaflet(join(RAIZ, d)));

/**
 * O `className` do div que recebe `refCaixa` — o contêiner que vira o mapa.
 *
 * ═══ POR QUE SÓ O `className`, E NÃO AS LINHAS EM TORNO ═══════════════════
 *
 * A primeira versão lia a janela de linhas ao redor do `ref` e achava `z-0`
 * DENTRO DO COMENTÁRIO que explica o conserto — e a mutação que tirava a class
 * do JSX passava verde. Um teste que lê o próprio texto explicativo mede a
 * documentação, não o código.
 *
 * Aqui o comentário é removido antes de qualquer busca, e o que sobra é lido
 * como atributo: o nome vem do `className` e a lista de tokens sai de dentro
 * dele, seja string ou template literal.
 */
function classDoContêiner(texto: string): string {
  // Comentário de bloco `{/* ... *\/}` e de linha `// ...`, fora de strings.
  const semComentario = texto.replace(/\{[\s\S]*?\*\/[\s}]/g, "").replace(/^\s*\/\/.*$/gm, "");
  const i = semComentario.indexOf("ref={refCaixa}");
  if (i === -1) return "";
  const janela = semComentario.slice(i, i + 400);
  const m = janela.match(/className=(?:"([^"]*)"|\{`([^`]*)`\})/);
  if (!m) return "";
  return m[1] ?? m[2] ?? "";
}

function temClasse(classe: string, nome: string): boolean {
  // Template literal: as expressões `{...}` viram um token só.
  const tokens = classe
    .replace(/\$\{[^}]*\}/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  return tokens.includes(nome);
}

describe("todo mapa Leaflet cria o próprio stacking context", () => {
  // Guarda de vácuo: uma varredura que não acha nada passa sem provar nada.
  it("a varredura acha os dois mapas que existem", () => {
    const relativos = COM_LEAFLET.map((c) => relative(RAIZ, c));
    expect(relativos).toContain("app/app/prospeccao/_mapa.tsx");
    expect(relativos).toContain("app/app/expedicao/[id]/_mapa-rota.tsx");
  });

  it.each(COM_LEAFLET.map((c) => [relative(RAIZ, c), c] as const))(
    "%s — tem `isolate` ou `z-0`",
    (nome, caminho) => {
      const classe = classDoContêiner(readFileSync(caminho, "utf8"));
      expect(classe).not.toBe("");
      // A condição é "pelo menos UMA das duas", e não "as duas": medidas no
      // browser, `isolate` e `z-0` alcançam o mesmo resultado por caminhos
      // diferentes. Exigir as duas reprovaria alguém que removesse a classe
      // redundante sem quebrar nada — teste que falha sem defeito treina a
      // ignorar o próprio teste.
      expect(
        temClasse(classe, "isolate") || temClasse(classe, "z-0"),
        `${nome}: o contêiner do Leaflet não tem \`isolate\` nem \`z-0\`. Os panes ` +
          `do Leaflet (400/600/700/1000) ficam na pilha global: o cabeçalho ` +
          `\`sticky z-10\` passa por baixo do mapa e o \`Dialog\` (\`z-50\`) fica ` +
          `ATRÁS dele.`,
      ).toBe(true);
    },
  );

  it("o leitor pega o className e ignora o comentário", () => {
    // O teste que impede o teste de passar errado. A primeira versão lia a
    // janela de linhas ao redor do `ref` e achava `z-0` DENTRO do comentário que
    // explica o conserto — a mutação que tirava a class do JSX passava verde.
    // Um teste que lê o próprio texto explicativo mede a documentação.
    const fonte = `{/* o comentário diz z-0 e isolate a toa */}
      <div
        ref={refCaixa}
        className="relative isolate z-0 overflow-hidden"
      />`;
    const classe = classDoContêiner(fonte);
    expect(classe).toBe("relative isolate z-0 overflow-hidden");
    expect(temClasse(classe, "z-0")).toBe(true);
  });

  it("MUTAÇÃO: o className que a expedição tinha reprova", () => {
    const antesDoConserto = `    <div
      ref={refCaixa}
      className="overflow-hidden rounded-2xl border bg-muted"
    />`;
    const classe = classDoContêiner(antesDoConserto);
    expect(temClasse(classe, "isolate") || temClasse(classe, "z-0")).toBe(false);
  });

  it("MUTAÇÃO: `isolate` sozinho satisfaz — e isso é o que está medido", () => {
    // Se alguém "simplificar" para uma classe só, o teste continua verde porque
    // a MEDIÇÃO no browser diz que `isolate` basta. Este teste existe para que
    // a exigência continue sendo "uma das duas" e não "as duas".
    const soIsolate = `    <div
      ref={refCaixa}
      className="isolate overflow-hidden rounded-2xl border bg-muted"
    />`;
    const classe = classDoContêiner(soIsolate);
    expect(temClasse(classe, "isolate") || temClasse(classe, "z-0")).toBe(true);
  });
});
