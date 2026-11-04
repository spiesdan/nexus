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

  it("a imagem tem GD com JPEG — o logo do emitente é convertido para JPEG", () => {
    // Medido: `docker-php-ext-install gd` sozinho NÃO habilita `imagejpeg`, e o
    // `sped-da` converte o logo com ela. Sem o configure, gerar DANFE com logo
    // morria em "Call to undefined function imagejpeg".
    const dockerfile = fs.readFileSync(path.join(RAIZ, "fiscal", "sidecar", "Dockerfile"), "utf8");
    expect(dockerfile).toContain("docker-php-ext-configure gd --with-jpeg");
  });

  it("logo quebrado não derruba o documento: há fallback sem logo", () => {
    const php = fs.readFileSync(path.join(RAIZ, "fiscal", "sidecar", "src", "ServicoNfe.php"), "utf8");
    expect(php).toContain("catch (\\Throwable $e)");
    expect(php).toMatch(/render\(''\)/);
  });

  it("o rodapé do DANFE usa o crédito do integrador, sem o Powered by NFePHP", () => {
    // O PDF é documento que chega ao cliente final: o crédito é configurável
    // (FISCAL_DANFE_CREDITO) e o "Powered by NFePHP®" é desligado.
    const php = fs.readFileSync(path.join(RAIZ, "fiscal", "sidecar", "src", "ServicoNfe.php"), "utf8");
    expect(php).toContain("creditsIntegratorFooter");
    expect(php).toContain("FISCAL_DANFE_CREDITO");
    expect(php).toMatch(/creditsIntegratorFooter\([\s\S]{0,400}?false\s*\)/);
  });

  it("a rota do app manda o logo do emitente quando existe", () => {
    const rota = fs.readFileSync(
      path.join(RAIZ, "app", "api", "v1", "invoices", "[id]", "danfe", "route.ts"),
      "utf8",
    );
    expect(rota).toContain("logo_base64");
    expect(rota).toContain("logo_path");
  });
});
