/**
 * SEEDS SÓ PELO HELPER — `execNpx`, nunca `execFileSync("npx", …)` cru.
 *
 * ## Por que
 *
 * O `npx` cru devolve `ENOENT spawnSync npx ENOENT` no Windows (o `.cmd` só
 * resolve por shell), e o spec perde no CARREGAMENTO do módulo: o `--list`
 * da suíte inteira morre com "No tests found" por erro de carga, não por
 * filtro — o run parece "vazio", não quebrado. Além disso o helper roda o
 * `tsx` direto pelo node, sem shell, então argumento com espaço, aspa ou
 * JSON (`JSON.stringify({ kind: "sent" })`) chega inteiro; sob shell do
 * Windows não chega.
 *
 * A troca dos 17 specs que contornavam o helper foi medida antes
 * (`tests/e2e/utils/npx.ts` tem o histórico); este gate é para o próximo
 * spec não reabrir a brecha — declarar a regra é uma coisa, vigiar é outra.
 *
 * Varre TODO `.ts` de `tests/e2e/` menos o próprio helper (que precisa
 * falar `execFileSync` para existir).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const DIR_E2E = path.join(process.cwd(), "tests", "e2e");
const AJUDANTE = path.join("utils", "npx.ts");

describe("spec chama npx pelo helper", () => {
  it("nenhum arquivo de tests/e2e usa execFileSync(\"npx\", …) cru", () => {
    const arquivos = readdirSync(DIR_E2E, { recursive: true })
      .map(String)
      .filter((f) => f.endsWith(".ts"))
      .filter((f) => !f.endsWith(AJUDANTE))
      .sort();

    const culpados = arquivos
      .map((f) => ({ f, texto: readFileSync(path.join(DIR_E2E, f), "utf8") }))
      .filter(({ texto }) => texto.includes('execFileSync("npx"'))
      .map(({ f }) => f);

    expect(
      culpados,
      "chame execNpx([...]) de ./utils/npx — o npx cru perde no Windows " +
        "(ENOENT no carregamento) e o shell quebra argumento com espaço/JSON.",
    ).toEqual([]);
  });
});
