/**
 * O DOCUMENTO DE DESIGN NÃO PODE MANDAR DESFAZER O PRODUTO.
 *
 * ─── O QUE FOI MEDIDO (18/11/2026, antes de escrever este gate) ────────────
 *
 * `docs/design-system/README.md` se declarava "Documentação Canônica — v1.0,
 * status Ativa, Sage + Atkinson Hyperlegible + Aerada + Phosphor" e dizia, com
 * todas as letras: "Quando houver conflito entre código e doc, **a doc vence** —
 * ajuste o código".
 *
 * O produto, medido no CSS, é outro desde **2026-09-21** (commit `385e32bb`,
 * "Redesign Nexus UI"): accent **lavanda** (`--color-accent` = `#7e77f0`), fonte
 * **Inter** via `next/font`, e o capítulo 02 chegava a proibir o roxo
 * ("Não importe roxo, azul-bandeira, ciano") — a cor que o produto pinta.
 *
 * Ou seja: quem lesse a pasta canônica e obedecesse a regra reintroduziria Sage
 * num produto lavanda. Documento que envelhece calado é o mesmo defeito que este
 * repositório já pagou caro em outras frentes (AGENTS.md citando versões
 * vencidas, `09-telas-estados` medindo o `page.tsx`, a matriz de rotas gerada).
 *
 * ─── POR QUE UM GATE, E NÃO SÓ A CORREÇÃO ─────────────────────────────────
 *
 * A correção de hoje (faixa de status em cada capítulo + mapa decisão → CSS)
 * envelhece do mesmo jeito se nada a vigiar. As três asserções abaixo são o
 * contrato mínimo:
 *
 *   1. o `DESIGN.md` cita as DUAS cores que o CSS declara — a de referência
 *      (grau 500) e a funcional (grau 600). Trocar o accent no CSS sem atualizar
 *      o documento reprova;
 *   2. a pasta histórica se declara histórica e aponta para `DESIGN.md` e
 *      `app/globals.css`, e afirma que **o CSS vence**;
 *   3. nenhum capítulo usa a fórmula sem qualificação
 *      "Source of truth: `app/design/lib/tokens.ts`" — que é a frase que
 *      apontava para a maquete de abril como se fosse o produto.
 *
 * A asserção 3 é sobre o CABEÇALHO do capítulo (`> **Source of truth:**`), não
 * sobre a prosa: o README precisa CITAR a frase antiga para explicar por que ela
 * foi removida, e um teste que proibisse o texto em qualquer lugar puniria a
 * documentação honesta do próprio defeito.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();

const ler = (...partes: string[]) => fs.readFileSync(path.join(RAIZ, ...partes), "utf8");

const CSS = ler("app", "globals.css");
const DESIGN = ler("DESIGN.md");
const PASTA = path.join(RAIZ, "docs", "design-system");

/** Valor literal de um token no bloco `:root` (primeira declaração do arquivo). */
function hexDoToken(prop: string): string | null {
  const m = new RegExp(`^\\s*${prop}\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;`, "m").exec(CSS);
  return m ? m[1]!.toLowerCase() : null;
}

describe("a paleta declarada no DESIGN.md é a que o CSS pinta", () => {
  it("o CSS tem os dois graus da rampa que o documento precisa citar", () => {
    // `--color-accent` é alias de `--color-accent-600` no produto. Se um dia
    // deixar de ser, o par documentado muda e este teste precisa acompanhar —
    // por isso ele lê o alias em vez de assumir o 600.
    const alias = /^\s*--color-accent\s*:\s*var\(--color-accent-(\d{2,3})\)\s*;/m.exec(CSS);
    expect(alias, "--color-accent deixou de ser alias da rampa").not.toBeNull();
    expect(hexDoToken(`--color-accent-${alias![1]}`)).not.toBeNull();
  });

  it("o documento cita a cor de REFERÊNCIA e a FUNCIONAL", () => {
    const referencia = hexDoToken("--color-lavender")!;
    const funcionalClaro = hexDoToken("--color-accent-600")!;
    const funcionalEscuro = hexDoToken("--color-accent-400")!;

    // A referência (#918df6) é a lavanda do DESIGN.md e mora no token
    // DECORATIVO (`--color-lavender`); a funcional é o grau 600 (#7e77f0) no
    // claro e o 400 (#a4a5ff) no escuro, porque o accent sobe um degrau sobre
    // fundo escuro. As três precisam aparecer, com o papel de cada uma:
    // documentar só a referência faz o leitor achar que o botão é mais claro do
    // que é, e documentar só o claro esconde a metade do produto.
    expect(DESIGN.toLowerCase()).toContain(referencia);
    expect(DESIGN.toLowerCase()).toContain(funcionalClaro);
    expect(DESIGN.toLowerCase()).toContain(funcionalEscuro);
  });
});

describe("a pasta histórica não se declara canônica", () => {
  const README = fs.readFileSync(path.join(PASTA, "README.md"), "utf8");

  it("diz que é histórico e nomeia a fonte canônica", () => {
    expect(README).toMatch(/HISTÓRICO|Histórico/);
    expect(README).toContain("DESIGN.md");
    expect(README).toContain("app/globals.css");
  });

  it("afirma que o CSS vence o documento", () => {
    // A regra invertida ("a doc vence — ajuste o código") é o que reintroduziria
    // a Sage: o documento descrevia uma paleta, o código pintava outra, e a
    // instrução mandava mudar o código. O contrato agora é o oposto.
    expect(README).toMatch(/o CSS vence/i);
  });

  it("todo capítulo que o produto superou carrega a faixa de status", () => {
    // 02 (paleta Sage) e 03 (tipografia Atkinson) são os dois que contradizem o
    // CSS de frente. Os demais continuam valendo como intenção, com o cabeçalho
    // apontando para a fonte real.
    for (const capitulo of ["02-palette-sage.md", "03-typography.md"]) {
      const texto = fs.readFileSync(path.join(PASTA, capitulo), "utf8");
      expect(texto, `${capitulo} sem faixa de status`).toMatch(/Histórico \(2026-04-28\)/);
    }
  });
});

describe("nenhum capítulo aponta a maquete como fonte do produto", () => {
  const capitulos = fs
    .readdirSync(PASTA)
    .filter((n) => n.endsWith(".md") && n !== "README.md");

  it.each(capitulos)("%s", (capitulo) => {
    const texto = fs.readFileSync(path.join(PASTA, capitulo), "utf8");
    // Só o CABEÇALHO interessa: é ele que quem lê encontra primeiro e usa para
    // saber onde a verdade mora. A prosa pode (e deve) citar a maquete antiga.
    const cabecalho = texto.split("\n").slice(0, 12).join("\n");
    const apontaParaMaquete =
      /^>\s*\*\*Source of truth:\*\*.*app\/design\/lib\/(tokens|fonts)\.ts/m.test(cabecalho);
    expect(
      apontaParaMaquete,
      `${capitulo}: o cabeçalho ainda declara a maquete de abril como fonte do produto`,
    ).toBe(false);
  });
});

describe("o screen-flow é plano, não o mapa vivo", () => {
  const FLOW = path.join(PASTA, "screen-flow");
  const README = fs.readFileSync(path.join(FLOW, "README.md"), "utf8");

  it("se declara plano e aponta o registro vivo de rotas", () => {
    expect(README).toMatch(/Plano de abril\/2026/);
    expect(README).toContain("lib/navigation/registry.ts");
    expect(README.toLowerCase()).not.toContain("árvore canônica");
  });

  it.each(
    fs.readdirSync(FLOW).filter((n) => n.endsWith(".md") && n !== "README.md"),
  )("%s carrega a faixa de plano", (arquivo) => {
    const texto = fs.readFileSync(path.join(FLOW, arquivo), "utf8");
    expect(texto.split("\n").slice(0, 14).join("\n")).toMatch(/Plano de abril\/2026/);
  });
});
