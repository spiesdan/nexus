import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * O RODAPÉ DO DANFE É CONFIGURAÇÃO, NUNCA UM NOME EMBUTIDO.
 *
 * O DANFE é o documento que chega ao cliente final de quem usa o produto. O
 * `sped-da` imprime "Powered by NFePHP" por padrão; trocar isso por um literal
 * — `"By nexus"`, o nome de um revendedor, qualquer string fixa — é o que a
 * doutrina de marca própria proíbe (`AGENTS.md`, "Marca própria"): a marca
 * resolve do banco (`platform_branding` / `organizations.settings.branding`),
 * não do repositório.
 *
 * Aqui se guarda o CONTRATO, com o que o vitest consegue provar sem PHP:
 *   - o sidecar usa `creditsIntegratorFooter`, para o rodapé não ser o default;
 *   - o valor vem de `FISCAL_DANFE_CREDITO` (ambiente), com vazio = sem crédito;
 *   - não existe nome de produto escrito no caminho do PDF.
 *
 * O que NÃO se prova aqui: o PDF renderizado. Isso exige imagem com `sped-da` e
 * está declarado como limitação no fragmento de release.
 */
const RAIZ = process.cwd();
const PHP = fs.readFileSync(path.join(RAIZ, "fiscal", "sidecar", "src", "ServicoNfe.php"), "utf8");

describe("rodapé do DANFE", () => {
  it("o crédito vem do ambiente e o default do sped-da é substituído", () => {
    expect(PHP).toContain("creditsIntegratorFooter");
    expect(PHP).toContain("getenv('FISCAL_DANFE_CREDITO')");
  });

  it("vazio significa sem crédito — não há fallback com nome de produto", () => {
    // A chamada é o `trim()` do ambiente direto para o rodapé: se houver um
    // fallback textual, ele aparece aqui e o teste reprova.
    expect(PHP).toMatch(/creditsIntegratorFooter\(\s*trim\(/);
    for (const nome of ["By nexus", "by nexus", "Powered by nexus", "Deskcomm"]) {
      expect(PHP, `nome de produto no PDF: ${nome}`).not.toContain(nome);
    }
  });

  it("o compose e o .env.example expõem a configuração ao sidecar", () => {
    const compose = fs.readFileSync(path.join(RAIZ, "docker-compose.prod.yml"), "utf8");
    expect(compose).toContain("FISCAL_DANFE_CREDITO");
    const exemplo = fs.readFileSync(path.join(RAIZ, ".env.example"), "utf8");
    expect(exemplo).toContain("FISCAL_DANFE_CREDITO");
  });
});
