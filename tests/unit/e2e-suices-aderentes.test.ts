/**
 * AS SUÍTES CORTAM O CI SEM MENTIR SOBRE O QUE ELAS COBREM.
 *
 * ## Por que isto existe
 *
 * O workflow `.github/workflows/e2e.yml` passou a escolher uma suíte por evento
 * (`pull_request` = smoke, `push` na main = critical, `schedule`/`dispatch` =
 * full). As listas vivem em `tests/e2e/suites/*.txt`, uma fonte por suíte,
 * consumida pelos scripts do `package.json` e pelo próprio workflow.
 *
 * O risco de uma suíte é o mesmo de qualquer filtro: ele encolhe o que roda, e o
 * job continua VERDE — verde que não distingue "a suíte escolhida passou" de
 * "a suíte escolhida cobre o que diz cobrir". Sem régua, uma edição à mão em
 * `smoke.txt` podia remover a spec que estava exatamente ali para pegar a
 * regressão, e ninguém percebia até a regressão chegar na main.
 *
 * ## As propriedades (e por quê estático)
 *
 * 1. **Vigência**: toda entrada de toda suíte existe no disco, com nome de spec.
 * 2. **Hierarquia**: smoke ⊆ critical ⊆ full — cada passo de evento roda um
 *    superconjunto do anterior, senão "subir de suíte" deixa de significar mais
 *    cobertura.
 * 3. **Fidelidade**: full É EXATAMENTE SPECS_PARTE_1 ∪ SPECS_PARTE_2 (o que o CI
 *    cobre). Se divergirem, a suíte full deixa de ser "tudo" e o nome vira
 *    afirmação.
 * 4. **Fora do CI**: nenhuma suíte nomeia spec de `FORA_DO_CI` — rodá-la sem os
 *    serviços (WAHA/Redis/Resend/Nuvemshop) falharia por infra e sinalizaria
 *    regressão falsa.
 * 5. **Consumo**: os scripts `test:e2e:{smoke,critical,full}` e o workflow
 *    apontam para os arquivos de suíte — declarar é uma coisa, executar é outra
 *    (mesma terceira ponta de `e2e-cobertura-completa`).
 *
 * Vive em `tests/unit/` de propósito: roda no `verify`, que é check obrigatório.
 * A propriedade é enumerável do repositório — não precisa de runner nem de banco.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const WORKFLOW = path.join(RAIZ, ".github", "workflows", "e2e.yml");
const PACOTE = path.join(RAIZ, "package.json");
const DIR_SUITE = path.join(RAIZ, "tests", "e2e", "suites");
const DIR_SPECS = path.join(RAIZ, "tests", "e2e");

/**
 * Mesmo parser estreito de `e2e-cobertura-completa.test.ts` (casa só a forma
 * `CHAVE: >-` com corpo indentado do workflow). Duplicado de propósito: uma
 * importação entre arquivos de teste acopalaria dois gates que precisam poder
 * falhar de forma independente — se um mudar a forma do outro, cada um acusa
 * no seu próprio território.
 */
function listaDoWorkflow(yml: string, chave: string): string[] {
  const re = new RegExp(`^\\s*${chave}:\\s*>-\\s*\\n((?:\\s{8,}\\S.*\\n)+)`, "m");
  const m = re.exec(yml);
  if (m === null) return [];
  return m[1]!
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.endsWith(".spec.ts"));
}

/**
 * Lê uma suíte. As DUAS formas de falha viram erro aqui: arquivo ausente e
 * linha em branco — `playwright test @arquivo` com linha vazia é um filtro
 * que pode casar nada (verde vazio) ou estourar, e ambos são pior que falhar.
 */
function leSuite(nome: string): string[] {
  const bruto = readFileSync(path.join(DIR_SUITE, `${nome}.txt`), "utf8");
  const linhas = bruto.split("\n").map((l) => l.trim()).filter((l) => l !== "");
  // Toda entrada tem que ser nome de spec válido — um `# comentário` ou um
  // path errado dentro da lista passaria despercebido até o dia em que o
  // filtro não casasse nada.
  for (const l of linhas) {
    expect(l, `${nome}.txt: entrada não é nome de spec — '${l}'`).toMatch(/^[a-z0-9-]+\.spec\.ts$/);
  }
  return linhas;
}

const yml = readFileSync(WORKFLOW, "utf8");
const pkg = JSON.parse(readFileSync(PACOTE, "utf8")) as { scripts: Record<string, string> };

const smoke = leSuite("smoke");
const critical = leSuite("critical");
const full = leSuite("full");

const parte1 = listaDoWorkflow(yml, "SPECS_PARTE_1");
const parte2 = listaDoWorkflow(yml, "SPECS_PARTE_2");
const foraDoCi = listaDoWorkflow(yml, "FORA_DO_CI");
const noDisco = readdirSync(DIR_SPECS).filter((f) => f.endsWith(".spec.ts"));

const semDuplicatas = (xs: string[]): string[] => xs.filter((x, i) => xs.indexOf(x) !== i);

describe("suítes do e2e (tests/e2e/suites/*.txt)", () => {
  it("controle positivo — leu as três listas e o workflow", () => {
    expect(noDisco.length, "nenhuma spec no disco").toBeGreaterThan(30);
    expect(smoke.length, "smoke.txt vazia ou ilegível").toBeGreaterThan(3);
    expect(critical.length, "critical.txt vazia ou ilegível").toBeGreaterThan(10);
    expect(full.length, "full.txt vazia ou ilegível").toBeGreaterThan(30);
    expect(parte1.length, "SPECS_PARTE_1 não lida do workflow").toBeGreaterThan(10);
    expect(parte2.length, "SPECS_PARTE_2 não lida do workflow").toBeGreaterThan(10);
    expect(foraDoCi.length, "FORA_DO_CI não lido do workflow").toBeGreaterThan(0);
  });

  it("vigência — toda entrada existe no disco", () => {
    for (const [nome, lista] of [
      ["smoke", smoke],
      ["critical", critical],
      ["full", full],
    ] as const) {
      const fantasmas = lista.filter((f) => !noDisco.includes(f));
      expect(
        fantasmas,
        `${nome}.txt aponta para spec inexistente — renomeada ou apagada. O ` +
          `Playwright aceita filtro que não casa nada e fica VERDE.\n`,
      ).toEqual([]);
      expect(semDuplicatas(lista), `${nome}.txt repete spec — roda duas vezes`).toEqual([]);
    }
  });

  it("hierarquia — smoke ⊆ critical ⊆ full", () => {
    // Cada evento roda um superconjunto do anterior. Sem isto, um "subir de
    // suíte" na revisão podia trocar specs de lugar e até PERDER cobertura.
    expect(smoke.filter((f) => !critical.includes(f)), "smoke tem spec que critical não tem").toEqual([]);
    expect(critical.filter((f) => !full.includes(f)), "critical tem spec que full não tem").toEqual([]);
    // O primeiro passo não pode ser vazio nem igual ao último por acidente de
    // edição — o motivo do degrau é ter degrau.
    expect(smoke.length, "smoke cresceu até virar critical — reavalie o degrau").toBeLessThan(critical.length);
    expect(critical.length, "critical cresceu até virar full — reavalie o degrau").toBeLessThan(full.length);
  });

  it("fidelidade — full É exatamente SPECS_PARTE_1 ∪ SPECS_PARTE_2", () => {
    const inventario = [...new Set([...parte1, ...parte2])].sort();
    expect(
      [...full].sort(),
      "full.txt divergiu do conjunto que o CI cobre (SPECS_PARTE_1+2). Ou a suíte " +
        `full encolheu (${full.length} de ${inventario.length}), ou cresceu para ` +
        "specs que o CI não roda. Em qualquer caso o nome 'full' virou afirmação.",
    ).toEqual(inventario);
  });

  it("nenhuma suíte roda spec FORA do CI", () => {
    const nasSuítes = [...smoke, ...critical, ...full];
    expect(
      nasSuítes.filter((f) => foraDoCi.includes(f)),
      "suíte nomeia spec de FORA_DO_CI — sem WAHA/Redis/Resend/Nuvemshop ela " +
        "falha por infra e sinaliza regressão falsa.",
    ).toEqual([]);
  });

  it("consumo — scripts e workflow leem as listas de verdade", () => {
    // O consumo local passou a ser pelo `scripts/test-e2e-suite.ts`. A forma
    // antiga (`playwright test @arquivo`) não existe no Playwright: 1.62.1
    // trata a linha como filtro regex que não casa nada e o run morre com
    // "No tests found" — medido depois de os gates estarem verdes. Declarar a
    // lista não garante que o mecanismo de consumo funciona, mas o caminho
    // atual tem de continuar sendo o script (e não voltar ao `@arquivo`).
    const script = readFileSync(path.join(RAIZ, "scripts", "test-e2e-suite.ts"), "utf8");
    expect(script, "scripts/test-e2e-suite.ts não lê tests/e2e/suites/${nome}.txt").toMatch(
      /tests\/e2e\/suites\/\$\{nome\}\.txt/,
    );
    // O script tem de passar as specs como ARGUMENTO para o CLI (o caminho que
    // o modo full já usa). A forma antiga (`playwright test @arquivo`) não
    // existe no Playwright e morre com "No tests found"; o comentário do
    // script a cita de propósito como contr exemplo, por isso a asserção é
    // sobre a invocação e não sobre o texto corrido.
    expect(script, "scripts/test-e2e-suite.ts não invoca o CLI com as specs como argumento").toMatch(
      /\[cli, "test", "--workers=1", \.\.\.specs/,
    );
    for (const [nome, scriptName] of [
      ["smoke", "test:e2e:smoke"],
      ["critical", "test:e2e:critical"],
      ["full", "test:e2e:full"],
    ] as const) {
      expect(
        pkg.scripts[scriptName] ?? "",
        `package.json: script ${scriptName} ausente ou não roda a suíte ${nome}`,
      ).toBe(`tsx scripts/test-e2e-suite.ts ${nome}`);
    }
    // O workflow roda smoke/critical lendo a lista do evento e o full pelas
    // variáveis SPECS_PARTE_* — é a mesma ponta de `e2e-cobertura-completa`:
    // declarar não é executar.
    expect(yml, "workflow não lê tests/e2e/suites/$SUITE.txt no passo do evento").toMatch(
      /cat "?tests\/e2e\/suites\/\$SUITE\.txt"?/,
    );
    expect(yml, "workflow voltou a invocar @arquivo (sintaxe inexistente)").not.toMatch(
      /playwright test @/,
    );
    const posDeploy = readFileSync(
      path.join(RAIZ, ".github", "workflows", "e2e-pos-deploy.yml"),
      "utf8",
    );
    expect(posDeploy, "e2e-pos-deploy não lê tests/e2e/suites/critical.txt").toMatch(
      /cat tests\/e2e\/suites\/critical\.txt/,
    );
    expect(yml, "SUITE do workflow não mapeia pull_request → smoke").toMatch(
      /github\.event_name == 'pull_request' && 'smoke'/,
    );
    expect(yml, "SUITE do workflow não mapeia push → critical").toMatch(
      /github\.event_name == 'push' && 'critical'/,
    );
    expect(yml, "SUITE do workflow não mapeia schedule → full").toMatch(
      /github\.event_name == 'schedule' && 'full'/,
    );
    // As três opções do dispatch têm que existir — senão o input oferece uma
    // suíte que o case do passo não conhece.
    for (const s of ["full", "critical", "smoke"]) {
      expect(yml, `workflow_dispatch: opção de suíte '${s}' ausente`).toMatch(
        new RegExp(`^\\s+- ${s}$`, "m"),
      );
    }
  });
});
