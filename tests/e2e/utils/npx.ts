/**
 * Chama `npx …` de forma que funcione NO WINDOWS e no Linux do CI.
 *
 * `execFileSync("npx", …)` sem shell devolve `ENOENT spawnSync npx ENOENT`
 * no Windows: o libuv procura o arquivo exato `npx`, e o `.cmd` só é
 * resolvido por um shell (medido nesta máquina; no Linux o arquivo `npx`
 * existe e o caminho direto funciona). `shell` só no win32, e os argumentos
 * são literais fixos de seed (nome de script, sem dado externo) — é por isso
 * que concatenar no shell é seguro aqui.
 */
import { execFileSync } from "node:child_process";

export function execNpx(args: string[], opts: Parameters<typeof execFileSync>[2] = {}) {
  return execFileSync("npx", args, { ...opts, shell: process.platform === "win32" });
}
