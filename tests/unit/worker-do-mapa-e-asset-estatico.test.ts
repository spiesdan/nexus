/**
 * O WORKER DO MAPA É ESTÁTICO — E O PROXY NÃO PODE PEDIR LOGIN PARA ELE.
 *
 * ─── O defeito que este arquivo existe para não deixar voltar ────────────────
 *
 * O mapa da expedição é MapLibre, e o MapLibre carrega um Web Worker como
 * MÓDULO (`maplibre-gl-worker.mjs`). O worker é quem indexa o GeoJSON: sem ele
 * os pinos aparecem (são DOM) e o traçado da rota não pinta.
 *
 * O `proxy.ts` roda em tudo que o matcher não exclui, e a lista de extensões
 * estáticas tinha `js` mas **não `mjs`**. Resultado medido em produção na
 * v1.52.1, no console do navegador:
 *
 *     rota Failed to load module script: non-JavaScript MIME type of "text/html"
 *     Error: Worker failed to load. Check that the worker URL is correct.
 *
 * O `307` para `/login` era servido no lugar do módulo — daí o `text/html`.
 *
 * ─── Por que um teste, e não um comentário ──────────────────────────────────
 *
 * A extensão que falta não faz barulho: o mapa abre, os pinos aparecem, e só a
 * linha da rota falta. Quem acrescentar outro asset `.mjs` no futuro tropeça na
 * mesma pedra, e o sintoma (um arquivo que "não existe" para o navegador) não
 * aponta para o matcher. O teste amarra as duas pontas: o arquivo tem de estar
 * em `public/` e a extensão tem de estar fora do matcher.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const PROXY = readFileSync(join(RAIZ, "proxy.ts"), "utf8");

/** A regex do matcher, lida do arquivo — não uma cópia escrita à mão. */
function matcher(): RegExp | null {
  // Entre `matcher: [` e a string há comentários; por isso o `[\s\S]*?` e a
  // âncora no início do padrão real (`/((?!_next`), em vez de pegar a
  // primeira aspa do bloco.
  const m = /matcher:[\s\S]*?"(\/\(\(\?!_next[^"]+)"/.exec(PROXY);
  if (!m?.[1]) return null;
  // O arquivo escreve a regex como string JS com `\\` — ao ler o texto, as
  // barras duplicadas fazem parte do literal, então normalizamos antes.
  return new RegExp(m[1].replace(/\\\\/g, "\\"));
}

describe("worker do MapLibre — asset estático fora do proxy", () => {
  it("o arquivo que o mapa pede existe em public/", () => {
    // O caminho é o mesmo que `_mapa-rota.tsx` passa a `setWorkerUrl`.
    const pedido = /setWorkerUrl\("([^"]+)"\)/.exec(
      readFileSync(join(RAIZ, "app/app/expedicao/[id]/_mapa-rota.tsx"), "utf8"),
    )?.[1];
    expect(pedido, "o mapa precisa apontar a URL do worker").toBeTruthy();
    expect(existsSync(join(RAIZ, "public", String(pedido).replace(/^\//, "")))).toBe(true);
  });

  it("o matcher do proxy NÃO intercepta .mjs", () => {
    const re = matcher();
    expect(re, "o matcher do proxy não foi encontrado").not.toBeNull();
    // O matcher é uma negação: se a regex CASA com o caminho, o proxy roda.
    // `.mjs` não pode casar.
    expect(re!.test("/maplibre-gl-worker.mjs")).toBe(false);
    // Guarda de vacuidade: a mesma regex continua casando com página comum.
    expect(re!.test("/app/expedicao")).toBe(true);
  });

  it("as extensões estáticas que o produto serve estão fora do matcher", () => {
    const re = matcher()!;
    for (const caminho of [
      "/maplibre-gl-worker.mjs",
      "/sw.js",
      "/notify-sw.js",
      "/_next/static/chunk.js",
      "/logo.png",
    ]) {
      expect(re.test(caminho), `${caminho} não pode passar pelo proxy`).toBe(false);
    }
  });
});
