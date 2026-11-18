/**
 * TOKEN DECLARADO, UTILITÁRIO MORTO — a classe que não existe e ninguém vê.
 *
 * ─── O DEFEITO QUE ESTE TESTE PEGOU (18/11/2026) ──────────────────────────
 *
 * O produto usa `text-accent-fg` em 10 lugares (chip de dia selecionado na
 * agenda, botão "concluir" da expedição, seletor da vitrine…). A ponte
 * `@theme inline` do `globals.css` mapeava `--color-accent-foreground` — o nome
 * do shadcn — e **não** `--color-accent-fg`. Resultado: o utilitário
 * `text-accent-fg` NÃO EXISTE, e o texto herda a cor do `body`.
 *
 * No tema claro a herança era, por acidente, o valor certo (texto Carbon sobre
 * accent violeta → 4,80:1). No escuro, o texto herdado é claro e o accent também
 * → **2,03:1**, medido em `/app/agenda`: o chip do dia selecionado
 * ("Semana", "18") era o elemento menos legível da tela.
 *
 * ─── A CLASSE DO DEFEITO, E POR QUE A RÉGUA É ESTA ────────────────────────
 *
 * Tailwind 4 gera utilitário a partir do `@theme`. Token declarado em `:root`
 * mas ausente do `@theme` não vira classe — e o JSX usa a classe do mesmo
 * jeito, sem erro de build, sem aviso, herdando outra cor. É o irmão do
 * `text-accent-strong` (classe morta encontrada em 18/11): o compilador não
 * reclama porque `className` é string.
 *
 * A régua: para cada `text-/bg-/border-/…-<nome>` no código, se existe
 * `--color-<nome>` no `globals.css`, então o `@theme inline` **precisa** declarar
 * `--color-<nome>`. Cores que não são nossas (a paleta embutida do Tailwind)
 * não têm `--color-<nome>` no CSS e ficam de fora — sem allowlist à mão, que
 * envelhece.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { semComentarios } from "../../scripts/auditoria/segmento-de-rota";

const RAIZ = process.cwd();
const CSS = fs.readFileSync(path.join(RAIZ, "app", "globals.css"), "utf8");

function bloco(seletor: string): string {
  const rx = new RegExp(`^${seletor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`, "m");
  const i = CSS.search(rx);
  if (i < 0) throw new Error(`não achei \`${seletor}\` em globals.css`);
  return CSS.slice(i, CSS.indexOf("\n}", i));
}

/** Nomes de token de cor declarados em qualquer bloco de tema. */
function tokensDeclarados(): Set<string> {
  const nomes = new Set<string>();
  for (const seletor of [":root", '[data-theme="light"]', '[data-theme="dark"]']) {
    for (const m of bloco(seletor).matchAll(/^\s*(--color-[a-z0-9-]+)\s*:/gm)) {
      nomes.add(m[1]!.replace("--color-", ""));
    }
  }
  return nomes;
}

/** Nomes que a ponte `@theme inline` expõe como utilitário. */
function tokensNaPonte(): Set<string> {
  const nomes = new Set<string>();
  for (const m of bloco("@theme inline").matchAll(/^\s*(--color-[a-z0-9-]+)\s*:/gm)) {
    nomes.add(m[1]!.replace("--color-", ""));
  }
  return nomes;
}

function arquivos(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of fs.readdirSync(path.join(RAIZ, dir))) {
    if (nome === "node_modules" || nome.startsWith(".")) continue;
    const rel = path.join(dir, nome);
    if (fs.statSync(path.join(RAIZ, rel)).isDirectory()) saida.push(...arquivos(rel));
    else if (/\.(tsx|ts)$/.test(nome) && !nome.includes(".test.")) saida.push(rel);
  }
  return saida;
}

const DECLARADOS = tokensDeclarados();
const NA_PONTE = tokensNaPonte();

/**
 * Prefixos de utilitário que recebem cor. `text-` cobre também tamanho
 * (`text-sm`), então só entram nomes que existem como token — o filtro é o
 * `DECLARADOS`, não o prefixo.
 */
const PREFIXOS = [
  "text",
  "bg",
  "border",
  "ring",
  "fill",
  "stroke",
  "outline",
  "divide",
  "from",
  "to",
  "via",
  "placeholder",
  "accent",
  "caret",
  "decoration",
  "shadow",
];

describe("todo token de cor declarado vira utilitário", () => {
  it("a ponte declara os mesmos nomes que os temas (guarda de vacuidade)", () => {
    // Sem isto, uma ponte vazia passaria no laço abaixo sem nenhuma asserção.
    expect(NA_PONTE.size).toBeGreaterThan(40);
    expect(DECLARADOS.size).toBeGreaterThan(40);
  });

  it("`--color-accent-fg` tem ponte — o caso que motivou o teste", () => {
    expect(NA_PONTE.has("accent-fg")).toBe(true);
  });

  it.each(arquivos("app").concat(arquivos("components")).concat(arquivos("lib")))(
    "%s",
    (arquivo) => {
      const codigo = semComentarios(fs.readFileSync(path.join(RAIZ, arquivo), "utf8"));
      const mortos = new Set<string>();

      const rx = new RegExp(`\\b(?:${PREFIXOS.join("|")})-([a-z][a-z0-9-]*)(?![\\w-])`, "g");
      for (const achado of codigo.matchAll(rx)) {
        const nome = achado[1]!;
        // Só interessa o que É token nosso (declarado no globals.css).
        if (!DECLARADOS.has(nome)) continue;
        if (!NA_PONTE.has(nome)) mortos.add(`${achado[0]}`);
      }

      expect([...mortos].sort(), `${arquivo}: classe sem utilitário (token não está no @theme)`).toEqual(
        [],
      );
    },
  );
});
