/**
 * F-09 — a cadeia de migrations é HISTÓRICO, não caminho de instalação.
 *
 * POR QUE ESTE GATE EXISTE
 *
 * Medido em 2026-11-16 (`docs/auditoria/12-migrations-e-rls.md` §2): das 292
 * migrations, **35 aplicam e 257 falham** num Postgres limpo. Nenhuma falha é
 * SQL quebrado — 257 de 257 citam objeto que existe no `baseline.sql`. A raiz
 * são **10 arquivos que são `SELECT 1;`** (0001–0009 e 0013): o schema fundacional
 * foi aplicado direto no projeto Supabase e nunca voltou como SQL.
 *
 * O dano não é "a cadeia falha": é que `supabase db push` **passa** e marca as
 * 257 como aplicadas sobre um schema parcial. Um banco que parece instalado e
 * não está. O produto não usa a cadeia em lugar nenhum — `install.sh`,
 * `update.sh`, `deploy.sh` e `db:migrate` aplicam o `baseline.sql` —, mas até
 * agora isso era um fato operacional, não uma regra com catraca.
 *
 * O QUE ESTE GATE PROTEGE
 *
 * 1. os **10 stubs** são exatamente estes: stub novo reprova; stub preenchido
 *    obriga a atualizar esta lista e a estratégia (`20-f09-estrategia.md`);
 * 2. **nenhum script do repo** aplica a cadeia como instalação;
 * 3. a documentação de operação avisa nos **três idiomas** (o produto é
 *    self-hosted e o operador lê o README da sua língua);
 * 4. a decisão de F-09 está escrita e citada.
 *
 * O QUE ELE NÃO É
 *
 * Não prova que o baseline instala — isso é `pnpm test:db` (install + update) e
 * `scripts/auditoria/replay-migrations.sh`. Aqui é leitura de disco, no
 * `test:unit`, para o achado não voltar por esquecimento.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(RAIZ, "supabase/migrations");

/**
 * Os dez arquivos que não contêm DDL. A lista é FECHADA: se um deles passar a
 * ter SQL, o gate pede para removê-lo daqui (e para revisar a estratégia); se
 * um arquivo novo nascer `SELECT 1;`, o gate reprova.
 */
const STUBS_CONHECIDOS = [
  "20260428195354_0001_platform_base.sql",
  "20260428195513_0002_event_log_and_compat.sql",
  "20260428195708_0003_customer_360.sql",
  "20260428200016_0004_whatsapp_waha.sql",
  "20260428200128_0005_ai_rag.sql",
  "20260428200211_0006_nuvemshop_lgpd.sql",
  "20260428200331_0007_security_hardening.sql",
  "20260429013958_0008_tenant_onboarding_state.sql",
  "20260429021857_0009_expand_messaging_constraints.sql",
  "20260429070000_0013_ai_faq_items.sql",
] as const;

/** Só o SQL, sem comentário de linha — para não confundir prosa com DDL. */
function sqlUtil(arquivo: string): string {
  return readFileSync(path.join(MIGRATIONS, arquivo), "utf8")
    .split("\n")
    .filter((linha) => !/^\s*--/.test(linha))
    .join("\n")
    .replace(/\s+/g, "")
    .toUpperCase();
}

const PKG = JSON.parse(readFileSync(path.join(RAIZ, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

describe("F-09 — catraca dos stubs da cadeia de migrations", () => {
  it("os stubs são exatamente os dez conhecidos — nem um a mais", () => {
    const stubsNoDisco = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) => sqlUtil(f) === "SELECT1;")
      .sort();

    expect(
      stubsNoDisco,
      "Migration que é só `SELECT 1;` não cria schema. Se ela é nova, escreva o DDL. " +
        "Se ela é uma das fundações conhecidas, a lista de F-09 precisa ser revista " +
        "junto com docs/auditoria/20-f09-estrategia.md.",
    ).toEqual([...STUBS_CONHECIDOS].sort());
  });

  it("nenhum dos dez stubs ganhou SQL sem a estratégia ser revista", () => {
    const comDdl = STUBS_CONHECIDOS.filter((f) => sqlUtil(f) !== "SELECT1;");
    expect(
      comDdl,
      "Um stub conhecido passou a ter DDL. Remova-o de STUBS_CONHECIDOS e atualize " +
        "docs/auditoria/20-f09-estrategia.md (e o número do 12-migrations-e-rls.md): " +
        "a cadeia pode ter mudado de estado.",
    ).toEqual([]);
  });
});

describe("F-09 — a cadeia não é caminho de instalação", () => {
  it("nenhum script npm aplica a cadeia (`supabase db push` / `migration up`)", () => {
    const aplicam = Object.entries(PKG.scripts)
      .filter(([, cmd]) => /supabase\s+(db\s+push|migration\s+up|db\s+reset)/i.test(cmd))
      .map(([nome, cmd]) => `${nome}: ${cmd}`);

    expect(
      aplicam,
      "A cadeia não reproduz o schema (35/292). Script que a aplica marca migrations " +
        "como aplicadas num banco parcial. O schema entra pelo baseline.sql (`db:migrate`).",
    ).toEqual([]);
  });

  it("o kit da VPS aplica o baseline, nunca a pasta de migrations", () => {
    const kit = path.join(RAIZ, "hostgator-setup-kit");
    const scripts = ["install.sh", "update.sh", "deploy.sh"].filter((f) =>
      existsSync(path.join(kit, f)),
    );
    expect(scripts.length, "o kit precisa de install/update/deploy").toBeGreaterThanOrEqual(2);

    for (const nome of scripts) {
      const corpo = readFileSync(path.join(kit, nome), "utf8");
      expect(corpo, `${nome} não pode aplicar a cadeia`).not.toMatch(/supabase\s+db\s+push/);
      expect(corpo, `${nome} não pode ler supabase\/migrations`).not.toContain("supabase/migrations");
      if (nome !== "deploy.sh") {
        expect(corpo, `${nome} aplica o baseline.sql`).toContain("baseline.sql");
      }
    }
  });
});

describe("F-09 — o aviso está na doc de quem instala, nos três idiomas", () => {
  const docs: ReadonlyArray<[string, RegExp]> = [
    ["README.md", /não use `supabase db push`|não as migrations/i],
    ["README.en.md", /NOT the migrations|`supabase db push` "succeeds"/i],
    ["README.es.md", /NO las migrations|`supabase db push` "pasa"/i],
    ["docs/SETUP.md", /PROIBIDO|Não use `supabase db push`/i],
  ];

  for (const [arquivo, aviso] of docs) {
    it(`${arquivo} avisa que o schema vem do baseline`, () => {
      const caminho = path.join(RAIZ, arquivo);
      expect(existsSync(caminho), `${arquivo} existe`).toBe(true);
      expect(readFileSync(caminho, "utf8")).toMatch(aviso);
    });
  }

  it("o caminho proibido está documentado para quem opera", () => {
    const proibicao = readFileSync(path.join(RAIZ, "supabase/migrations/README.md"), "utf8");
    expect(proibicao).toMatch(/PROIBIDO/);
    expect(proibicao).toContain("supabase db push");
    expect(proibicao).toContain("baseline.sql");

    const doutrina = readFileSync(path.join(RAIZ, "CLAUDE.md"), "utf8");
    expect(doutrina, "a doutrina de migrations precisa proibir o push").toMatch(
      /NUNCA[^\n]*supabase db push|supabase db push[^\n]*NUNCA/,
    );

    const setup = readFileSync(path.join(RAIZ, "docs/SETUP.md"), "utf8");
    expect(setup).toMatch(/PROIBIDO/);
  });

  it("o MANIFEST não manda reaplicar a cadeia (é registro, não instalador)", () => {
    // Achado em 18/11/2026: o README da pasta já dizia "PROIBIDO", mas a seção
    // "Reproducibility" do MANIFEST mandava "replay the migrations in version
    // order via supabase db push". Quem lê o MANIFEST — o arquivo que registra
    // cada migration — recebia a instrução contrária à decisão F-09=B.
    const manifesto = readFileSync(path.join(RAIZ, "supabase/migrations/MANIFEST.md"), "utf8");
    expect(manifesto, "o MANIFEST precisa avisar que a pasta é histórico").toMatch(
      /HISTÓRICO, não instalador/,
    );
    expect(manifesto, "o MANIFEST precisa nomear o caminho proibido").toMatch(/PROIBIDO/);
    expect(manifesto).toContain("baseline.sql");
    expect(
      manifesto,
      "o MANIFEST não pode instruir replay da cadeia — o schema vem do baseline",
    ).not.toMatch(/replay the migrations|reaplicar as migrations|aplique as migrations em ordem/i);
  });

  it("planos ativos não ensinam `supabase db push`", () => {
    // P3-03: os planos em docs/superpowers/plans/ são receita para quem
    // implementa. Instrução de `db push` ali é a mesma armadilha da doc de
    // operação, um nível abaixo na hierarquia. Registros históricos
    // (`plan/progress.md`) não entram: descrevem o que aconteceu, não o que
    // fazer.
    const dir = path.join(RAIZ, "docs/superpowers/plans");
    const infratores = readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .filter((f) => /supabase\s+db\s+push/i.test(readFileSync(path.join(dir, f), "utf8")));
    expect(infratores, "plano ativo ensinando o caminho proibido (F-09=B)").toEqual([]);
  });

  it("a estratégia de F-09 está escrita", () => {
    const caminho = path.join(RAIZ, "docs/auditoria/20-f09-estrategia.md");
    expect(existsSync(caminho), "20-f09-estrategia.md existe").toBe(true);
    const texto = readFileSync(caminho, "utf8");
    expect(texto).toContain("F-09");
    expect(texto, "a decisão precisa estar explícita").toMatch(/DECISÃO|Recomendação/);
  });
});
