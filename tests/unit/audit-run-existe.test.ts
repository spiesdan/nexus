/**
 * `pnpm audit:run` — o comando que a cadeia `before_send` promete e não existia.
 *
 * O comentário da cadeia (`lib/agent-engine/guardrails/before-send.ts`) diz que
 * cada gate vira linha durável em `before_send_traces` e que o trace é
 * "exportável por run — o comando `pnpm audit:run`, acceptance 3". O comando não
 * existia: a linha era gravada e ninguém conseguia exportá-la.
 *
 * Este teste vigia a promessa: o script tem de estar no `package.json`, apontar
 * para o arquivo que existe e rodar com `tsx`.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const PKG = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

describe("pnpm audit:run", () => {
  it("existe no package.json e aponta para o script de export do trace", () => {
    const comando = PKG.scripts["audit:run"];
    expect(comando).toBeDefined();
    expect(comando).toContain("scripts/auditoria/audit-run.ts");
    expect(comando).toContain("tsx");
  });

  it("o arquivo existe e lê a tabela durável do before_send", () => {
    const caminho = join(RAIZ, "scripts/auditoria/audit-run.ts");
    expect(existsSync(caminho)).toBe(true);
    const fonte = readFileSync(caminho, "utf8");
    expect(fonte).toContain("before_send_traces");
    // Exige um recorte: exportar a instalação inteira não é auditoria de run.
    expect(fonte).toContain('argumento("--run")');
    expect(fonte).toContain('argumento("--org")');
  });
});
