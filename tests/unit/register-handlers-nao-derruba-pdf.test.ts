import { describe, expect, it, vi } from "vitest";

/**
 * UM HANDLER QUE NÃO SOBE DESLIGA O AGENTE INTEIRO.
 *
 * Este teste existe por um defeito medido na VPS. `lib/event-log/register-handlers`
 * registra TODOS os handlers do event-log, e ele importa
 * `workers/lgpd-export-worker.handler`, que importava `lib/lgpd/pdf-renderer` no
 * topo do arquivo. O `@react-pdf/renderer` carrega o `@react-pdf/textkit`, que
 * pede `@react-pdf/hyphenate/en-us` — subpath que o `tsx` do worker não resolve:
 *
 *   Package subpath './en-us' is not defined by "exports" in …/hyphenate/package.json
 *
 * Um gerador de PDF derrubava o bot do inbox, os follow-ups e as automações.
 *
 * A asserção é sobre a FORMA do import, e não sobre o comportamento do PDF:
 * o defeito é "quem puxa o react-pdf", e nenhum teste de execução pegaria um
 * import que só quebra em runtime dentro do container.
 */
describe("register-handlers: o PDF não pode entrar no grafo do worker", () => {
  it("lgpd-export-worker não importa o renderizador de PDF no topo", async () => {
    const fs = await import("node:fs/promises");
    const fonte = await fs.readFile("workers/lgpd-export-worker.ts", "utf8");

    // Só as linhas de import do topo contam. O import dinâmico fica dentro de
    // uma função, indentado — e é justamente esse que é permitido.
    const linhas = fonte.split("\n");
    const importsEstaticos = linhas
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => /^\s*import\s+[^;(]*from\s+["']/.test(l))
      .filter(({ l }) => !l.includes("pdf-renderer"));

    expect(
      importsEstaticos.some(({ l }) => l.includes("@react-pdf")),
      `import estático de @react-pdf no topo do arquivo: ${importsEstaticos
        .map(({ l }) => l.trim())
        .filter((l) => l.includes("@react-pdf"))
        .join(" | ")}`,
    ).toBe(false);

    expect(
      fonte.includes("import { renderLgpdPdf }") &&
        /^\s*import\s/m.test(fonte.slice(0, fonte.indexOf("import { renderLgpdPdf }"))),
      "renderLgpdPdf está sendo importado estaticamente — volta a derrubar o worker",
    ).toBe(false);

    // E o import dinâmico tem que EXISTIR: sem ele,LGPD só foi quebrado de
    // outro jeito.
    expect(fonte).toContain('await import("@/lib/lgpd/pdf-renderer")');
  });

  it("register-handlers não puxa react-pdf por nenhum caminho estático", async () => {
    const fs = await import("node:fs/promises");
    const grafo: string[] = ["lib/event-log/register-handlers.ts"];
    const vistos = new Set<string>();

    // Percorre os imports estáticos a partir do registro dos handlers — que é
    // o ponto de partida real do estrago. Segue só por import ESTÁTICO: é o
    // import dinâmico justamente o que o conserto introduce.
    while (grafo.length > 0) {
      const atual = grafo.pop()!;
      if (vistos.has(atual)) continue;
      vistos.add(atual);

      let fonte: string;
      try {
        fonte = await fs.readFile(atual, "utf8");
      } catch {
        continue;
      }

      expect(
        /^\s*import\s[^;]*["']@react-pdf/m.test(fonte),
        `${atual} importa @react-pdf estaticamente — o worker volta a depender do gerador de PDF`,
      ).toBe(false);

      for (const m of fonte.matchAll(/^\s*import\s[^;]*from\s+["']([^"']+)["']/gm)) {
        const spec = m[1]!;
        if (!spec.startsWith("@/") && !spec.startsWith("./") && !spec.startsWith("../")) continue;
        const base = spec.replace(/^@\//, "").replace(/^\.\/?/, "");
        grafo.push(base.endsWith(".ts") || base.endsWith(".tsx") ? base : `${base}.ts`);
      }
    }

    // Guarda de vacuidade: o walker tem que ter andado em arquivos de verdade.
    expect(
      vistos.size,
      "o walker não seguiu nenhum import — o teste não mediu nada",
    ).toBeGreaterThan(8);
  });
});
