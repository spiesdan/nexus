import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

/**
 * MapLibre `-dev` fora do artefato publicado.
 *
 * O `dist/maplibre-gl.mjs` escolhe o nome do worker em runtime
 * (`…-dev.mjs` × `…mjs`), e o bundler copia os DOIS para
 * `.next/static/media`: 3,5 MB medidos (`maplibre-gl-dev` 2,4 MB +
 * `maplibre-gl-worker-dev` 1,1 MB) que nenhuma requisição de produção pede.
 *
 * O passo de limpeza roda no `pnpm build` (portanto no Docker e no CI). O que
 * este teste mede:
 *   1. `package.json` chama o limpador no build — sem isso o arquivo some do
 *      pipeline e a limpeza deixa de existir;
 *   2. o limpador remove APENAS os `-dev` e preserva os de produção;
 *   3. sem` .next/static/media` ele não quebra (build sem mapa).
 */
const RAIZ = path.resolve(__dirname, "../..");
const SCRIPT = path.join(RAIZ, "scripts/limpar-assets-dev-do-maplibre.mjs");

describe("maplibre -dev fora do build publicado", () => {
  let dir: string | null = null;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  it("o build chama o limpador", () => {
    const pkg = JSON.parse(readFileSync(path.join(RAIZ, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.build).toContain("limpar-assets-dev-do-maplibre.mjs");
  });

  it("remove os -dev e preserva os de produção", () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "maplibre-dev-"));
    dir = tmp;
    const media = path.join(tmp, ".next", "static", "media");
    mkdirSync(media, { recursive: true });

    const dev = ["maplibre-gl-dev.abc.mjs", "maplibre-gl-worker-dev.def.mjs"];
    const prod = ["maplibre-gl.ghi.mjs", "maplibre-gl-worker.jkl.mjs", "maplibre-gl.xyz.css"];
    for (const nome of [...dev, ...prod]) writeFileSync(path.join(media, nome), "x");

    execFileSync(process.execPath, [SCRIPT], { cwd: tmp, stdio: "pipe" });

    const listados = execFileSync("ls", [media], { encoding: "utf8" }).trim().split("\n");
    expect(listados.sort()).toEqual(prod.sort());
  });

  it("sem .next/static/media, não quebra", () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "maplibre-vazio-"));
    dir = tmp;
    expect(() =>
      execFileSync(process.execPath, [SCRIPT], { cwd: tmp, stdio: "pipe" }),
    ).not.toThrow();
  });
});
