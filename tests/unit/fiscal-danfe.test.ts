import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * O DANFE NÃO PODE SER UM "SUGERIDO".
 *
 * O sidecar declara `nfephp-org/sped-da` em `suggest` desde o começo. `suggest`
 * NÃO É INSTALADO: a imagem saía sem o pacote, e `GET /invoices/{id}/danfe`
 * respondia 422 "DANFE_INDISPONIVEL" para toda nota — com a mensagem certa e
 * nenhum PDF. O endpoint parecia pronto porque o código existia; o que faltava
 * era a dependência, e nada no repositório cobrava isso.
 *
 * Este arquivo é a ponte entre o PHP (que não tem suíte) e o vitest: lê o
 * `composer.json` e exige o pacote em `require`.
 */
const RAIZ = process.cwd();
const COMPOSER = path.join(RAIZ, "fiscal", "sidecar", "composer.json");

describe("DANFE do sidecar", () => {
  it("sped-da está em require — `suggest` não instala nada", () => {
    const d = JSON.parse(fs.readFileSync(COMPOSER, "utf8")) as {
      require?: Record<string, string>;
      suggest?: Record<string, string>;
    };
    expect(d.require?.["nfephp-org/sped-da"], "sem isto o /danfe responde DANFE_INDISPONIVEL").toBeTruthy();
    expect(d.suggest?.["nfephp-org/sped-da"]).toBeUndefined();
  });

  it("o endpoint usa a classe que o pacote instala", () => {
    const php = fs.readFileSync(path.join(RAIZ, "fiscal", "sidecar", "src", "ServicoNfe.php"), "utf8");
    expect(php).toContain("NFePHP\\DA\\NFe\\Danfe");
  });
});
