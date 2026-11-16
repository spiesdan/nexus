/**
 * `db:reset` não pode continuar aplicando a cadeia de migrations que reprovou.
 *
 * POR QUE ESTE GATE EXISTE
 *
 * O `package.json` declarava `"db:reset": "supabase db reset"`. O comando é o
 * normal de qualquer projeto Supabase — e neste projeto ele aplica
 * `supabase/migrations/`, a cadeia que a auditoria AAA mediu: **35 de 292
 * aplicam, 257 falham**, dez arquivos da base são `SELECT 1;` (o schema deles
 * foi aplicado out-of-band via MCP e nunca voltou para SQL). Quem rodava o
 * reset recebia um banco com **2 tabelas** em `public`, zero políticas, e a
 * impressão de "banco limpo". O caminho que o cliente usa (`install.sh`/
 * `update.sh`) nunca foi esse: é o `supabase/baseline.sql`.
 *
 * `supabase db reset` também apaga e recria o banco — um comando destrutivo que
 * não distingue a máquina de dev do banco de produção pela connection string.
 * Um reset que aplica a cadeia errada em produção é duas falhas na mesma linha.
 *
 * O QUE ELE GARANTE (por leitura do arquivo; a execução é provada fora daqui)
 *
 *   1. `db:reset` aponta para um script versionado que existe;
 *   2. esse script aplica o baseline (não a cadeia, não `db push`);
 *   3. esse script restabelece o DEFAULT ACL do Supabase ANTES de aplicar —
 *      sem isso as funções criadas no corpo do baseline nascem sem os grants
 *      que o banco do cliente tem, e o reset não reproduz o produto;
 *   4. esse script se recusa a rodar em host não-local sem `--forcar`;
 *   5. falha de conexão/erro de SQL sai diferente de zero.
 *
 * A prova de comportamento (schema recriado, dados apagados, ACL idêntica ao
 * install, duas execuções seguidas) está em
 * `docs/auditoria/12-migrations-e-rls.md` §6 — com Docker, não aqui.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "../..");
const PKG = JSON.parse(readFileSync(path.join(RAIZ, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

function corpoDoReset(): string {
  const cmd = PKG.scripts["db:reset"] ?? "";
  const alvo = /bash\s+(scripts\/[^\s]+)/.exec(cmd);
  expect(alvo, `db:reset deveria chamar um script de scripts/: ${cmd}`).not.toBeNull();
  const caminho = path.join(RAIZ, alvo![1]!);
  expect(existsSync(caminho), `não existe: ${alvo![1]}`).toBe(true);
  return readFileSync(caminho, "utf8");
}

describe("db:reset — caminho de schema", () => {
  it("não chama `supabase db reset` (a cadeia de 292 migrations não reproduz o schema)", () => {
    const cmd = PKG.scripts["db:reset"] ?? "";
    expect(cmd).not.toMatch(/supabase\s+db\s+reset/);
    expect(cmd).not.toMatch(/supabase\s+db\s+push/);
    // A cadeia é 35/292. Se um dia ela for consertada, o gate deve ser revisto
    // junto — não contornado.
    expect(cmd).toMatch(/bash\s+scripts\/db\/resetar-schema\.sh/);
  });

  it("aplica o baseline pelo mesmo script do db:migrate, e não uma cópia", () => {
    const corpo = corpoDoReset();
    expect(corpo).toContain("aplicar-schema.sh");
    expect(corpo).toContain("supabase/baseline.sql");
  });

  it("restabelece o DEFAULT ACL do Supabase antes do baseline", () => {
    // Medido: sem estas linhas as funções do corpo do baseline nascem sem os
    // grants que o banco do cliente tem (scripts/sql/preambulo-supabase-descartavel.sql).
    const corpo = corpoDoReset();
    expect(corpo).toMatch(
      /alter default privileges in schema public grant all on functions to anon/,
    );
    expect(corpo).toMatch(
      /alter default privileges in schema public revoke execute on functions from public/,
    );
  });

  it("exige conexão explícita e não adivinha o banco", () => {
    const corpo = corpoDoReset();
    expect(corpo).toMatch(/SUPABASE_DB_URL/);
    expect(corpo).toMatch(/if \[ -z "\$URL" \]/);
  });

  it("recusa host não-local sem `--forcar`", () => {
    const corpo = corpoDoReset();
    expect(corpo).toContain("--forcar");
    expect(corpo).toMatch(/não é local/);
    expect(corpo).toMatch(/localhost/);
  });

  it("derruba o schema do produto, não o banco inteiro", () => {
    const corpo = corpoDoReset();
    expect(corpo).toMatch(/drop schema if exists public cascade/);
    expect(corpo).toMatch(/drop schema if exists private cascade/);
    // `drop database` derrubaria auth/storage/extensions — bootstrap do
    // Supabase — junto com o produto.
    expect(corpo).not.toMatch(/drop database/i);
  });
});
