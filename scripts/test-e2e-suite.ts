/**
 * Roda uma suíte de E2E (smoke | critical | full) — o consumidor LOCAL das
 * listas em `tests/e2e/suites/*.txt`.
 *
 * ## Por que este arquivo existe e não `playwright test @arquivo`
 *
 * A sintaxe `@arquivo` NÃO existe no Playwright. Medido em 1.62.1 (o que este
 * repo roda): `playwright test @tests/e2e/suites/smoke.txt` trata a linha
 * inteira como um filtro regex que não casa nenhum caminho e o run termina com
 * `Error: No tests found.` em 4 segundos — foi exatamente o que derrubou o
 * primeiro push do `e2e.yml` com suítes, depois de os gates estarem verdes:
 * o gate de aderência cobre que as listas EXISTEM e são CONSUMIDAS, não que o
 * mecanismo de consumo funciona. Só a execução de perto prova isso.
 *
 * O caminho que funciona é o mesmo do CI: ler as linhas e passá-las como
 * argumentos (`playwright test --workers=1 <specs…>`), que é o que o modo
 * full do `e2e.yml` já faz com `$SPECS_PARTE_*`. No `package.json` isso não
 * dá para escrever em shell portável (o cmd do Windows não entende
 * `$(cat …)`), e o `tsx` já é o mecanismo do repo para scripts — daí este
 * arquivo.
 *
 * Uso:
 *   pnpm test:e2e:smoke                      # a suíte do PR
 *   pnpm test:e2e:critical                   # a suíte da main
 *   pnpm test:e2e:full                       # as 88
 *   pnpm test:e2e:smoke -- --list            # args extras passam adiante
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const SUITES = ["smoke", "critical", "full"] as const;

const nome = process.argv[2];
if (nome === undefined || !(SUITES as readonly string[]).includes(nome)) {
  console.error(`Uso: tsx scripts/test-e2e-suite.ts <${SUITES.join("|")}> [args do playwright…]`);
  process.exit(1);
}

const arquivo = `tests/e2e/suites/${nome}.txt`;
const specs = readFileSync(arquivo, "utf8")
  .split(/\r?\n/)
  .map((linha) => linha.trim())
  .filter((linha) => linha !== "");

// Falha alto nas DUAS formas de silêncio: lista vazia (rodar "nada" passaria
// como verde) e entrada malformada (um filtro que não casa nada faz o
// Playwright dizer "No tests found" — o mesmo modo de falha do `@arquivo`).
if (specs.length === 0) {
  console.error(`${arquivo} está vazia — nada a rodar. Isto é erro, não "tudo verde".`);
  process.exit(1);
}
for (const s of specs) {
  if (!/^[a-z0-9-]+\.spec\.ts$/.test(s)) {
    console.error(`${arquivo}: entrada que não é nome de spec: '${s}'`);
    process.exit(1);
  }
}

console.info(`suíte ${nome}: ${specs.length} specs (${arquivo})`);

const extras = process.argv.slice(3);
// O CLI é resolvido do próprio node_modules e invocado como `node cli.js` —
// sem `pnpm exec`, sem shell (que no Windows só resolve `.cmd` e ainda emite
// DEP0190 por concatenar argumento sem escapar). `@playwright/test/cli` é o
// bin `playwright`; o processo node puro é o mesmo no Windows e no Linux.
const cli = createRequire(path.join(process.cwd(), "package.json")).resolve("@playwright/test/cli");
const resultado = spawnSync(process.execPath, [cli, "test", "--workers=1", ...specs, ...extras], {
  stdio: "inherit",
  env: {
    ...process.env,
    // O mesmo teto de CI. As specs compartilham UMA conta admin com MFA e o
    // limitador por IP (60/300s) é por processo: rodar a suíte inteira num
    // `next start` só estoura o teto do produto e falha por infra, não por
    // regressão — medido no CI ao subir a suíte de 15 para 29 specs. O teto
    // por CONTA (5 falhas) continua valendo, e é ele que barra brute force.
    AUTH_RATE_LIMIT_LOGIN_IP: process.env.AUTH_RATE_LIMIT_LOGIN_IP ?? "1000",
  },
});

process.exit(resultado.status ?? 1);
