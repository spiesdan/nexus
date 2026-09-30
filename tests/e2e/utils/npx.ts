/**
 * Chama `npx …` — na prática sempre `npx tsx <script> …` — de forma que
 * funcione NO WINDOWS e no Linux do CI, e sem catinga de argumento.
 *
 * ## O caminho preferido: `tsx` direto pelo node
 *
 * `execNpx(["tsx", "script.ts", …])` vira `node …/tsx/dist/cli.mjs script.ts …`
 * (resolvido por `tsx/cli` a partir do package.json da raiz). Sem `npx`, sem
 * shell, sem cmd.exe: os argumentos chegam no script como argumentos — o que
 * importa porque alguns SÃO dado externo formatado (`JSON.stringify({
 * kind: "sent" })` em `followup-journey.spec.ts`), e sob shell do Windows
 * aspas e espaço viram dois argumentos.
 *
 * ## Por que o caminho antigo (`npx` direto) quebrava
 *
 * `execFileSync("npx", …)` sem shell devolve `ENOENT spawnSync npx ENOENT`
 * no Windows: o libuv procura o arquivo exato `npx`, e o `.cmd` só é
 * resolvido por um shell (medido nesta máquina; no Linux o arquivo `npx`
 * existe e o caminho direto funciona). Os specs que chamavam `npx` cru
 * perdiam no carregamento do módulo — e o `--list` de qualquer suíte que os
 * importasse morria com "No tests found" por erro de carga, não por filtro.
 * `tests/unit/e2e-npx-somente-pelo-helper.test.ts` vigia que não voltem.
 */
import { execFileSync } from "node:child_process";
import type {
  ExecFileSyncOptions,
  ExecFileSyncOptionsWithBufferEncoding,
  ExecFileSyncOptionsWithStringEncoding,
} from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

// Base de resolução = package.json da RAIZ (cwd de todo runner deste repo:
// playwright, tsx e vitest todos partem da raiz). `import.meta.url` não
// serve aqui: o Playwright transforma spec em CJS e `import.meta` não existe
// nesse runtime.
const exigirNaRaiz = createRequire(path.join(process.cwd(), "package.json"));

// As sobrecargas espelham o `execFileSync`: sem elas o `{ encoding: "utf8" }`
// de `runHelper`/`helper` voltaria `string | Buffer` e o `.trim()` de quem
// consome não passaria no typecheck.
export function execNpx(args: string[], opts: ExecFileSyncOptionsWithStringEncoding): string;
export function execNpx(args: string[], opts: ExecFileSyncOptionsWithBufferEncoding): Buffer;
export function execNpx(args: string[], opts?: ExecFileSyncOptions): string | Buffer;
export function execNpx(args: string[], opts?: ExecFileSyncOptions): string | Buffer {
  if (args[0] === "tsx") {
    const cli = exigirNaRaiz.resolve("tsx/cli");
    return execFileSync(process.execPath, [cli, ...args.slice(1)], opts);
  }
  // Fora de `tsx` — nenhum call site hoje, mantido como escape consciente:
  // no Windows só o shell resolve o `npx.cmd`, e os argumentos têm de ser
  // literais fixos (sem dado externo, sem espaço) para a concatenação ser
  // segura. Um dia aparecer um call site assim é aqui que se vê o custo.
  return execFileSync("npx", args, { ...opts, shell: process.platform === "win32" });
}
