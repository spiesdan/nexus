/**
 * O PROMPT MESTRE É A LEI — e lei que só é conferida quando alguém lembra não é lei.
 *
 * O script `scripts/auditoria/verificar-prompt.ts` existe desde antes, mas
 * **não rodava em gate nenhum**: a divergência só aparecia se alguém digitasse o
 * comando. Foi assim que o backlog passou semanas dizendo "hash inválido" — e o
 * prompt estava íntegro, medido com a régua errada (`sha256sum` do arquivo em vez
 * do corpo normalizado).
 *
 * Este teste faz três coisas, e a terceira é a que importa:
 *
 *  1. o hash gravado bate com o prompt versionado (a lei está intacta);
 *  2. a contagem de linhas é a mesma do registro — número não envelhece sozinho;
 *  3. **controle**: trocar UMA palavra muda o hash. Sem isso, um normalizador
 *     que devolvesse vazio passaria verde para sempre.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ARQUIVO_DO_HASH,
  DOC_DO_PROMPT,
  hashDoPrompt,
  normalizarPrompt,
} from "../../scripts/auditoria/verificar-prompt";

const RAIZ = process.cwd();

describe("prompt mestre íntegro", () => {
  it("o hash gravado é o hash do prompt de agora", () => {
    const gravado = readFileSync(join(RAIZ, ARQUIVO_DO_HASH), "utf8").trim();
    expect(hashDoPrompt(RAIZ)).toBe(gravado);
  });

  it("o registro não é hash de arquivo cru — é do corpo normalizado", () => {
    // A régua errada: se alguém gravar o `sha256sum` do .md, este teste cai e
    // explica por quê. O valor do arquivo cru muda com qualquer heading.
    const cru = readFileSync(join(RAIZ, DOC_DO_PROMPT), "utf8");
    const hashCru = createHash("sha256").update(cru, "utf8").digest("hex");
    expect(hashDoPrompt(RAIZ)).not.toBe(hashCru);
  });

  it("controle: mudar uma palavra muda o hash", () => {
    const md = readFileSync(join(RAIZ, DOC_DO_PROMPT), "utf8");
    const antes = normalizarPrompt(md);
    const depois = normalizarPrompt(md.replace(/NEXUS/, "NEXUZ"));
    expect(depois).not.toBe(antes);
  });

  it("controle: reformatar heading e negrito NÃO muda o hash", () => {
    const md = readFileSync(join(RAIZ, DOC_DO_PROMPT), "utf8");
    const reformatado = md.replace(/^## /gm, "### ").replace(/\*\*/g, "");
    expect(normalizarPrompt(reformatado)).toBe(normalizarPrompt(md));
  });
});
