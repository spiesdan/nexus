/**
 * A BASE DO PLAYWRIGHT NO DOCKERFILE TEM QUE CASAR COM O LOCKFILE.
 *
 * Medido em produção em 18/11/2026: `Dockerfile.mercos` usava
 * `mcr.microsoft.com/playwright:v1.64.0-noble` enquanto o lockfile tinha
 * `@playwright/test` 1.65.1. O worker de PEDIDOS continuou funcionando (usa o
 * Chromium completo), mas o coletor de CATÁLOGO chamava o headless shell, que a
 * base v1.64 não traz:
 *
 *   browserType.launch: Executable doesn't exist at
 *   /ms-playwright/chromium_headless_shell-1255/...
 *
 * O build passava verde e o erro só aparecia no primeiro uso do recurso — na
 * VPS, em produção. Este teste fecha a porta antes do build: o `FROM` tem que
 * declarar a mesma versão que o `package.json` pede.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();

function versaoDoLockfile(): string {
  const pkg = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8")) as {
    devDependencies?: Record<string, string>;
    dependencies?: Record<string, string>;
  };
  const bruto = pkg.devDependencies?.["@playwright/test"] ?? pkg.dependencies?.["@playwright/test"] ?? "";
  const versao = bruto.replace(/^[\^~>=<\s]+/, "").trim();
  expect(versao, "@playwright/test sem versão declarada no package.json").toMatch(/^\d+\.\d+\.\d+/);
  return versao;
}

function baseDoDockerfile(arquivo: string): string | null {
  const texto = readFileSync(join(RAIZ, arquivo), "utf8");
  const m = texto.match(/^FROM\s+mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-/m);
  return m?.[1] ?? null;
}

describe("Dockerfile do Mercos × versão do Playwright", () => {
  it("a base declarada é exatamente a versão que o package.json pede", () => {
    const esperada = versaoDoLockfile();
    const base = baseDoDockerfile("Dockerfile.mercos");
    expect(base, "Dockerfile.mercos não declara uma base mcr.microsoft.com/playwright:vX.Y.Z").not.toBeNull();
    expect(base).toBe(esperada);
  });

  it("a imagem verifica que o headless shell existe (o coletor depende dele)", () => {
    const texto = readFileSync(join(RAIZ, "Dockerfile.mercos"), "utf8");
    expect(texto).toMatch(/chromium_headless_shell/);
  });
});
