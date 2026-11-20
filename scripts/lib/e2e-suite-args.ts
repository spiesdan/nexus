/**
 * OS ARGUMENTOS DO PLAYWRIGHT PARA UMA SUÍTE — uma função, testável.
 *
 * O gate `e2e-suices-aderentes` cobrava a invocação por REGEX no texto do
 * script. Quando o `--output` entrou na chamada, o regex deixou de casar e o
 * gate ficou vermelho mesmo com o runner correto: regex em código é frágil.
 * Aqui a montagem vira array e o gate assere sobre o array — as specs continuam
 * sendo passadas uma a uma (nunca "todas por omissão") e o `--output` fica
 * fora de `test-results`.
 */
export interface ArgumentosDaSuite {
  /** Caminho absoluto do CLI (`@playwright/test/cli`). */
  cli: string;
  /** Specs lidas de `tests/e2e/suites/<nome>.txt`. */
  specs: readonly string[];
  /** Diretório de artefatos, fora de `test-results`. */
  outputDir: string;
  /** Argumentos extras do chamador (`--reporter=line`, `-g`, …). */
  extras?: readonly string[];
}

export function argumentosDaSuite({
  cli,
  specs,
  outputDir,
  extras = [],
}: ArgumentosDaSuite): string[] {
  if (!cli) throw new Error("argumentosDaSuite: cli vazio");
  if (specs.length === 0) throw new Error("argumentosDaSuite: suíte sem specs");
  if (!outputDir) throw new Error("argumentosDaSuite: outputDir vazio");
  return [cli, "test", "--workers=1", "--output", outputDir, ...specs, ...extras];
}
