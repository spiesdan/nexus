/**
 * A INSTALAÇÃO DO CHROMIUM NO CI É UMA SÓ, E ELA TEM AS TRÊS DEFESAS.
 *
 * ## Por que isto existe
 *
 * Em 2026-11-11 o job `e2e` ficou vermelho em CINCO execuções seguidas, sempre
 * no mesmo passo e sempre antes da suíte começar: o `playwright install-deps`
 * rodava `apt-get update` e o apt do runner não resolvia
 * `azure.archive.ubuntu.com` (`Temporary failure resolving`), saindo 100. O PR
 * não mergeava — `e2e` é check obrigatório — e nenhum teste rodou em 1h45 de CI.
 *
 * O passo estava escrito DUAS vezes, inline, em `e2e.yml` e `e2e-pos-deploy.yml`.
 * Duas cópias divergem (e é o que acontece com qualquer par), então a correção
 * saiu de lá e virou `scripts/ci/instalar-chromium.sh`, chamado pelos dois. Este
 * teste é o que impede a volta: o que está provado é que os workflows NÃO
 * voltaram a carregar a receita de instalação, que o script tem as três defesas
 * (dry-run offline → retry → prova de que o Chromium abre) e que o teste dessas
 * defesas roda no gate `pnpm test:shell`.
 *
 * Roda no `verify` (check obrigatório) e não precisa de runner, rede nem browser:
 * a propriedade é enumerável do repositório.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const SCRIPT = path.join(RAIZ, "scripts", "ci", "instalar-chromium.sh");
const TESTE_DO_SCRIPT = path.join(RAIZ, "tests", "shell", "instalar-chromium.test.sh");
const WORKFLOWS = [
  path.join(".github", "workflows", "e2e.yml"),
  path.join(".github", "workflows", "e2e-pos-deploy.yml"),
];

const leia = (relativo: string) => readFileSync(path.join(RAIZ, relativo), "utf8");

describe("CI: a instalação do Chromium é uma só e tem as três defesas", () => {
  it("o script e o teste dele existem", () => {
    expect(existsSync(SCRIPT), "scripts/ci/instalar-chromium.sh sumiu").toBe(true);
    expect(existsSync(TESTE_DO_SCRIPT), "tests/shell/instalar-chromium.test.sh sumiu").toBe(true);
  });

  it.each(WORKFLOWS)("%s chama o script — e não repete a receita inline", (workflow) => {
    const yml = leia(workflow);
    expect(yml, `${workflow} não chama o script`).toContain("bash scripts/ci/instalar-chromium.sh");

    // A receita antiga, que quebrou em 11/11. `--with-deps` volta a acoplar o
    // download do browser ao apt; `install-deps` fora do script duplica a regra.
    expect(yml, `${workflow} voltou a usar --with-deps`).not.toContain("--with-deps");
    expect(yml, `${workflow} voltou a chamar install-deps direto`).not.toContain(
      "exec playwright install-deps",
    );
  });

  it("o cache do Chromium chega ao script pelo env", () => {
    for (const workflow of WORKFLOWS) {
      const yml = leia(workflow);
      expect(yml, `${workflow} não informa CHROMIUM_CACHE_HIT`).toContain(
        "CHROMIUM_CACHE_HIT: ${{ steps.cache-chromium.outputs.cache-hit }}",
      );
    }
  });

  it("o script mantém as três defesas, na ordem em que foram medidas", () => {
    const sh = readFileSync(SCRIPT, "utf8");

    // 1. offline primeiro: simular antes de depender da rede, e só pular o apt
    //    quando o apt também souber resolver o pacote (falso positivo do
    //    --dry-run quando o índice está ausente).
    const dryRun = sh.indexOf("--dry-run");
    const retry = sh.indexOf("install-deps chromium");
    expect(dryRun, "o dry-run offline saiu do script").toBeGreaterThan(-1);
    expect(retry, "o install-deps de verdade saiu do script").toBeGreaterThan(dryRun);
    expect(sh, "a checagem que cobre o falso positivo do --dry-run saiu").toContain(
      "apt_conhece_libnss3",
    );

    // 2. retry: o laço tem de existir, não só ser citado.
    expect(sh, "o retry com backoff saiu do script").toMatch(/for tentativa in \$\(seq 1/);
    expect(sh, "o script não espera entre as tentativas").toMatch(/sleep "\$espera"/);

    // 3. prova de que o browser abre antes de derrubar o gate.
    expect(sh, "a prova de que o Chromium abre saiu do script").toContain(
      "provar-chromium.cjs",
    );

    // E a reprovação continua sendo reprovação: sem `exit 1` no fim, o passo
    // ficaria verde sem browser e a suíte falharia por um motivo que não é o
    // real.
    expect(sh, "o caminho de falha não reprova").toMatch(/exit 1/);
  });

  it("o teste das defesas roda em pnpm test:shell (job do CI)", () => {
    const pacote = JSON.parse(leia("package.json")) as { scripts: Record<string, string> };
    expect(pacote.scripts["test:shell"]).toContain("tests/shell/instalar-chromium.test.sh");
  });
});
