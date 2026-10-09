/**
 * SALVAR A CONFIGURACAO NAO APAGA O CERTIFICADO.
 *
 * ─── O defeito, medido ───────────────────────────────────────────────────────
 *
 * Em 09/10/2026 a e2e `jornada-fiscal` parou de conseguir emitir nota. O
 * caminho e este, e nenhum passo dele parece errado quando lido sozinho:
 *
 *   1. A pessoa (ou o teste) envia o certificado por upload.
 *      -> `POST /fiscal-settings/certificado` grava `certificado_path`
 *         e escreve o `.pfx` em disco.
 *   2. A pessoa (ou o teste) salva a configuracao fiscal.
 *      -> `PUT /fiscal-settings` faz `upsert` com `onConflict: organization_id`
 *         e o corpo CONTEM `certificado_path: null`.
 *   3. O banco passa a dizer que nao ha certificado. O `.pfx` continua no disco.
 *
 * O passo 3 e o defeito: `upsert` reescreve a linha com o que o corpo
 * **menciona**, e `null` e uma mencao que vale como valor.
 *
 * ─── Por que isso e pior do que parece ───────────────────────────────────────
 *
 * O arquivo esta a dois centimetros do caminho gravado. A tela mostra "Nenhum
 * certificado no servidor", a emissao para, e nao existe erro, log ou nenhuma
 * pista apontando para um PUT de configuracao. Quem depura procura a rota de
 * upload — que funcionou — e nao encontra o culpado.
 *
 * ─── O que este teste segura ─────────────────────────────────────────────────
 *
 * A regra: **esta rota nao e o caminho para apagar certificado.** Apagar e o
 * que o botao de remover faz, e ele nao e este. Se algum dia precisar limpar o
 * caminho, isso e uma rota nova e explicita — nao um `null` acidental num
 * formulario de configuracao.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROTA = join(process.cwd(), "app/api/v1/fiscal-settings/route.ts");

function fonte(): string {
  return readFileSync(ROTA, "utf8");
}

describe("PUT /fiscal-settings nao apaga o certificado", () => {
  it("o `upsert` NAO leva `certificado_path` no corpo", () => {
    const s = fonte();
    // O spread que vai para o `upsert` nao pode ser o `resto` cru: ele contem
    // `certificado_path` com `null` vindo do schema.
    const inicio = s.indexOf(".upsert(");
    expect(inicio, "a rota nao tem mais upsert — este teste precisa ser revisto").toBeGreaterThan(
      -1,
    );
    const corpo = s.slice(inicio, s.indexOf("{ onConflict", inicio));
    expect(corpo, "o upsert ainda recebe o `resto` cru, com certificado_path").not.toContain(
      "...resto,",
    );
    expect(corpo, "o upsert deveria usar o corpo sem o caminho").toContain("...restoSemCaminho,");
  });

  it("o `certificado_path` e retirado do corpo antes do `upsert`", () => {
    const s = fonte();
    // A linha que faz a omissao. Sem ela, o teste acima passaria por acaso —
    // `restoSemCaminho` nao viria de lugar nenhum.
    expect(s).toMatch(
      /const\s*\{\s*certificado_path\s*:\s*_\w+\s*,\s*\.\.\.restoSemCaminho\s*\}\s*=\s*resto/,
    );
  });

  it("a senha cifrada continua sendo enviada", () => {
    // A omissao do caminho nao pode ter derrubado o resto do corpo — a senha do
    // certificado e o outro campo que a rota monta a mao, e e o que a pessoa
    // espera que a tela salve.
    const s = fonte();
    const inicio = s.indexOf(".upsert(");
    const corpo = s.slice(inicio, s.indexOf("{ onConflict", inicio));
    expect(corpo).toContain("certificado_senha_encrypted");
  });

  it("o schema aceita `null` — e por isso o bug e possivel", () => {
    // Documenta a armadilha: nada no schema impede `null`, e nenhum erro de
    // sintaxe aponta para o `upsert`. Se algum dia fecharem o schema, este
    // teste avisa que a omissao virou redundante — e ai pode ser removida com
    // ele, nao antes.
    const s = readFileSync(join(process.cwd(), "lib/schemas/fiscal.ts"), "utf8");
    expect(s).toMatch(
      /certificado_path:\s*z\.string\(\)\.trim\(\)\.max\(\d+\)\.nullable\(\)\.optional\(\)/,
    );
  });
});
