/**
 * TODO WORKFLOW EM `.github/workflows` FAZ PARSE.
 *
 * ─── Por que este teste existe ──────────────────────────────────────────────
 *
 * O `apk.yml` nasceu com um bloco de comentário estilo JSDoc no topo — que não
 * é comentário em YAML (`*` é alias). O run falhava com 0 jobs e nenhuma
 * mensagem dizendo onde. Custou dois ciclos de CI para achar, e o achado foi
 * lendo o YAML com um parser na mão.
 *
 * O teste `gatilho-dos-jobs-de-entrega` documenta que "não há parser YAML nas
 * dependências" como motivo para recorte por regex. Agora há (`js-yaml`, dev)
 * — e este teste usa para o que regex não pega: o arquivo inteiro precisa ser
 * YAML válido, com `on` e `jobs` legíveis.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import yaml from "js-yaml";

const DIR = join(process.cwd(), ".github/workflows");

describe("workflows fazem parse", () => {
  const arquivos = readdirSync(DIR).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));

  it("há workflows para vigiar — controle positivo", () => {
    expect(arquivos.length).toBeGreaterThan(3);
  });

  for (const arq of arquivos) {
    it(`${arq} é YAML válido com on e jobs`, () => {
      let doc: unknown;
      expect(() => {
        doc = yaml.load(readFileSync(join(DIR, arq), "utf8"));
      }, `${arq} não faz parse — o run falha com 0 jobs e sem mensagem`).not.toThrow();
      const d = doc as Record<string, unknown>;
      expect(d, `${arq} sem bloco 'on'`).toHaveProperty("on");
      expect(d, `${arq} sem bloco 'jobs'`).toHaveProperty("jobs");
      expect(
        typeof d.on === "string" || (typeof d.on === "object" && d.on !== null),
        `${arq} com 'on' ilegível`,
      ).toBe(true);
    });
  }
});
