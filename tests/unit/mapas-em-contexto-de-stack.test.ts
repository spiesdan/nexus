/**
 * Todo contêiner de mapa do repo cria o próprio stacking context — e faz isso
 * de um jeito que TODO browser entende.
 *
 * ═══ O BUG, E OS DOIS LADOS DELE ══════════════════════════════════════════
 *
 * Um mapa não é uma imagem: ele pinta em várias camadas com z-index próprio,
 * na MESMA pilha da página.
 *
 *   Leaflet  → `.leaflet-pane` com 400 overlay · 600 marcadores · 700 popup ·
 *              800/1000 controle, e `position: absolute` nos panes.
 *   MapLibre → canvas, controles (`z-index: 2`) e marcadores dentro do
 *              contêiner, que o próprio MapLibre posiciona.
 *
 * Nos dois casos, sem `position` no contêiner os filhos absolutos ancoram no
 * ancestral POSICIONADO mais próximo, que pode estar bem acima do mapa — e aí o
 * `overflow: hidden` do mapa não recorta nada.
 *
 * E sem stacking context próprio:
 *
 * - o cabeçalho `sticky top-14 z-10` da ficha de expedição fica ABAIXO de popup
 *   e marcadores — o mapa invade o cabeçalho ao rolar;
 * - `Dialog`/`Sheet` (`z-50`) ficam ATRÁS do mapa.
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
 * browser. `isolate` fica como reforço, nunca como o que sustenta o conserto.
 *
 * ═══ POR QUE ESTE TESTE EXISTE ════════════════════════════════════════════
 *
 * Porque o conserto já foi feito uma vez, pela metade: `app/app/prospeccao/
 * _mapa.tsx` ganhou `isolate` e a ficha de expedição ficou sem nada. Mesmo
 * sintoma, outra tela, mesma causa.
 *
 * E porque a ficha de expedição TROCOU de biblioteca (Leaflet → MapLibre,
 * ADR-0003) e o conserto de stacking continuou valendo: a varredura é por
 * "quem instancia um mapa", não por "quem importa Leaflet". Gate que vigia
 * biblioteca em vez de sintoma deixa de vigiar no dia da migração.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();

const DIRETORIOS = ["app", "components", "lib"];
const IGNORAR = new Set(["node_modules", ".next", ".git", "graphify-out", ".repro"]);

/**
 * Instancia um mapa — em qualquer das duas bibliotecas que o repo usa.
 *
 * O `\b` antes do `L` não é enfeite: sem ele, `ABAS_DO_FISCAL.map(...)` casa
 * com `L.map(` e a varredura passa a exigir stacking context de uma lista de
 * abas. A primeira versão deste padrão fazia exatamente isso — quatro falsos
 * positivos, todos do mesmo jeito: constante terminada em "L".
 */
const INSTANCIA_MAPA = /(\bL\.map\(|new\s+lib\.Map\(|new\s+maplibregl\.Map\()/;

function arquivosComMapa(dir: string, achados: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    if (IGNORAR.has(entrada)) continue;
    const caminho = join(dir, entrada);
    if (statSync(caminho).isDirectory()) {
      arquivosComMapa(caminho, achados);
      continue;
    }
    if (!/\.tsx?$/.test(entrada)) continue;
    const texto = readFileSync(caminho, "utf8");
    // Só interessa quem INSTANCIA. Importar o tipo não cria pane nenhum.
    if (INSTANCIA_MAPA.test(texto)) achados.push(caminho);
  }
  return achados;
}

const COM_MAPA = DIRETORIOS.flatMap((d) => arquivosComMapa(join(RAIZ, d)));

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

describe("todo mapa cria o próprio stacking context", () => {
  // Guarda de vácuo: uma varredura que não acha nada passa sem provar nada.
  it("a varredura acha os mapas que existem", () => {
    const relativos = COM_MAPA.map((c) => relative(RAIZ, c));
    // Prospecção continua no Leaflet; a expedição está no MapLibre.
    expect(relativos).toContain("app/app/prospeccao/_mapa.tsx");
    expect(relativos).toContain("app/app/expedicao/[id]/_mapa-rota.tsx");
  });

  it("os mapas encontrados usam só as duas bibliotecas conhecidas", () => {
    // Se aparecer um terceiro mapa, ele entra na varredura acima e nas
    // asserções de stacking abaixo sem ninguém editar o teste.
    for (const caminho of COM_MAPA) {
      const texto = readFileSync(caminho, "utf8");
      expect(INSTANCIA_MAPA.test(texto), `${caminho} sem instância reconhecida`).toBe(true);
    }
  });

  it.each(COM_MAPA.map((c) => [relative(RAIZ, c), c] as const))(
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
        `${nome}: o contêiner do mapa não tem \`isolate\` nem \`z-0\`. As camadas ` +
          `do mapa ficam na pilha global: o cabeçalho \`sticky z-10\` passa por ` +
          `baixo dele e o \`Dialog\` (\`z-50\`) fica ATRÁS.`,
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
