/**
 * `db:migrate` não pode sair com código 0 sem ter feito nada.
 *
 * POR QUE ESTE GATE EXISTE
 *
 * Até 2026-11-15 o `package.json` declarava:
 *
 *   "db:migrate": "echo 'TODO: wire supabase db push or pg-migrate' && exit 0"
 *
 * Quem rodasse `pnpm db:migrate` — e o `scripts/deploy.sh` rodava, com um
 * `|| true` em cima — recebia **sucesso**. O schema não era tocado, nenhuma
 * migration era aplicada, e o pipeline seguia como se a etapa de banco tivesse
 * passado. Um placeholder que falha é um TODO; um placeholder que sai 0 é uma
 * afirmação falsa, e é a pior categoria de defeito de instalação: o cliente
 * descobre no primeiro 500, não no deploy.
 *
 * O caso ficou pior quando a auditoria AAA mediu a cadeia de 292 migrations
 * (`docs/auditoria/12-migrations-e-rls.md`): ela NÃO reproduz o schema — dez
 * migrations da base são stubs `SELECT 1;`. Então "implementar" o TODO com
 * `supabase db push` seria trocar a mentira silenciosa por uma mentira cara:
 * `db push` marcaria as migrations como aplicadas sobre um schema parcial.
 *
 * A correção é o que este gate protege: `db:migrate` aponta para um script que
 * APLICA o `baseline.sql` (o mesmo caminho do install.sh/update.sh) e VERIFICA
 * o resultado, saindo diferente de zero quando o schema não está lá.
 *
 * O QUE ELE NÃO É
 *
 * Não executa banco — é leitura de arquivo, roda no `test:unit`. A prova de que
 * o script aplica e verifica de verdade é o replay de migrations e o
 * `test-update-com-dados.sh`, não este arquivo.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "../..");
const PKG = JSON.parse(readFileSync(path.join(RAIZ, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

describe("package.json — scripts de banco", () => {
  it("nenhum script pode terminar em `&& exit 0` (placeholder que mente)", () => {
    const mentirosos = Object.entries(PKG.scripts)
      .filter(([, cmd]) => /&&\s*exit\s+0\s*$/.test(cmd))
      .map(([nome, cmd]) => `${nome}: ${cmd}`);

    expect(
      mentirosos,
      "Script que imprime aviso e sai 0 faz o pipeline acreditar que a etapa passou. " +
        "Se a etapa não existe, ela tem de FALHAR (exit != 0) ou ser implementada — nunca " +
        "retornar sucesso. Caso real: db:migrate até 2026-11-15.",
    ).toEqual([]);
  });

  it("db:migrate aponta para um script que existe no repositório", () => {
    const cmd = PKG.scripts["db:migrate"];
    expect(cmd, "db:migrate precisa existir — é o passo de schema do deploy").toBeDefined();

    const alvo = /bash\s+(scripts\/[^\s]+)/.exec(cmd ?? "");
    expect(alvo, `db:migrate deveria chamar um script de scripts/: ${cmd}`).not.toBeNull();
    expect(existsSync(path.join(RAIZ, alvo![1]!)), `não existe: ${alvo![1]}`).toBe(true);
  });

  it("db:migrate usa o baseline e não `supabase db push`", () => {
    // A cadeia de migrations não reproduz o schema (10 stubs `SELECT 1;`, medido
    // em docs/auditoria/12-migrations-e-rls.md). `db push` marcaria migrations
    // como aplicadas num banco incompleto: um deploy que "passa" sem produto.
    const cmd = PKG.scripts["db:migrate"] ?? "";
    expect(cmd).not.toMatch(/supabase\s+db\s+push/);

    const alvo = /bash\s+(scripts\/[^\s]+)/.exec(cmd);
    const corpo = readFileSync(path.join(RAIZ, alvo![1]!), "utf8");
    expect(corpo, "o script de schema tem de aplicar o baseline").toContain("baseline.sql");
    expect(corpo, "e tem de falhar quando o schema não está lá").toMatch(/exit 1/);
  });

  it("db:verificar existe e não escreve (modo de conferência)", () => {
    const cmd = PKG.scripts["db:verificar"];
    expect(cmd, "deploy não deve mutar schema; precisa de um modo somente-leitura").toBeDefined();
    expect(cmd).toContain("--verificar");
  });
});
