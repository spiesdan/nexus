import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";
import { TABELAS_DA_VARREDURA } from "./_rls-varredura-tabelas";
import { TABELAS_PROVADAS_AQUI } from "./f17-tabelas-provadas";
import { TABLES } from "./rls-isolation.test";

/**
 * VARREDURA de completude de RLS — o buraco que o próprio `rls-isolation.test.ts`
 * confessa no cabeçalho da sua lista `TABLES` (linha ~208):
 *
 *     ⚠️ LISTA FIXA — tabela tenant-aware nova que NÃO entrar aqui passa verde
 *     sem RLS. Não existe varredura genérica do tipo "toda tabela com
 *     organization_id tem relrowsecurity = true".
 *
 * ## Por que NÃO basta olhar só o catálogo (`relrowsecurity` + "tem policy")
 *
 * Porque uma policy pode estar sabotada e ainda assim passar em qualquer
 * checagem de catálogo. Medido de verdade neste repo: `org_guardrail_layers`
 * tinha `relrowsecurity = true` e uma policy — e a policy dizia
 * `organization_id in (select fn_user_org_ids()) or true`, que devolve a
 * organização INTEIRA do vizinho. RLS ligada e policy presente não é isolamento;
 * é só a forma que o isolamento tem que ter. A prova real só existe simulando o
 * JWT de um usuário de verdade e CONTANDO linhas cross-tenant — o que
 * `rls-isolation.test.ts` já faz, por tabela, na lista `TABLES`.
 *
 * ## O que ESTA varredura fecha, então
 *
 * `TABLES` é mantida à mão. Quem cria uma tabela nova com `organization_id` e
 * esquece de acrescentar a linha ali (no MESMO commit da migration, como o
 * comentário de lá já pede) não quebra nada: o CI segue verde, e a tabela fica
 * sem NENHUMA prova de isolamento — nem de catálogo, nem de comportamento.
 * Ninguém percebe até alguém vazar dado do vizinho em produção.
 *
 * Esta varredura DERIVA a lista de tabelas tenant-aware do catálogo (não há o
 * que esquecer de acrescentar) e reprova qualquer uma que não apareça em
 * `TABLES` nem numa exceção nomeada — forçando toda tabela nova a ganhar o
 * teste comportamental de verdade antes que o gate deixe passar.
 *
 * ## As três listas de exceção, e por que são coisas diferentes
 *
 * Não existe uma varredura anterior a esta, então aplicar a regra "está em
 * TABLES ou reprova" de uma vez batia em 73 tabelas que já existiam, têm RLS
 * ligada, mas nunca tinham ganhado um teste `set role authenticated` + contagem
 * cross-org num arquivo dedicado — dívida herdada. Fingir que elas "passavam"
 * seria mentir. A saída honesta foi DISTINGUIR as classes:
 *
 *   - `TABLES` (rls-isolation.test.ts): teste comportamental por tabela.
 *   - `PROVA_PROPRIA`: tabela fora de `TABLES`, com teste comportamental real
 *     (JWT simulado + contagem cross-org) em outro arquivo. Cada entrada cita o
 *     arquivo que prova.
 *   - `PROVADA_POR_VARREDURA`: as 73 que eram `DEBITO_CONHECIDO` até
 *     2026-11-18. A dívida foi FECHADA: `rls-varredura-comportamental.test.ts`
 *     semeia uma linha por organização em cada uma e mede os quatro eixos
 *     (SELECT/UPDATE/DELETE cross-org, INSERT cross-org recusado, com controle
 *     positivo na própria org). `DEBITO_CONHECIDO` deixou de existir — não há
 *     mais tabela tenant-aware neste repositório sem prova comportamental.
 *
 * Em todas, `relrowsecurity = true` é reconferido pela própria varredura: uma
 * exceção cuja tabela sumiu ou perdeu RLS reprova, na hora, em vez de continuar
 * "documentando" uma proteção que já não existe.
 */

interface Excecao {
  readonly tabela: string;
  readonly razao: string;
}

/**
 * Tabelas fora de `TABLES` com teste comportamental de verdade em outro
 * arquivo — verificado lendo cada um: `set role authenticated` (ou
 * `countAs`/`writeCountAs`, que fazem o mesmo) + JWT do usuário + contagem de
 * linhas da OUTRA organização, não uma leitura como superusuário.
 */
const PROVA_PROPRIA: readonly Excecao[] = [
  {
    tabela: "webhook_lead_captures",
    razao:
      "tests/invariants/historico-de-captacao-rls.test.ts prova isolamento " +
      "cross-tenant E o gate de papel (viewer não lê). Fica fora de TABLES " +
      "de propósito: o usuário semeado em rls-isolation.test.ts é `agent`, e " +
      "a policy desta tabela exige `manager` — o controle positivo falharia " +
      "por ACERTO ali.",
  },
  {
    tabela: "meta_templates",
    razao:
      "tests/invariants/meta-templates-rls.test.ts (\"membro da org B NÃO vê " +
      "o template da org A\") prova isolamento com `countAs` real.",
  },
  {
    tabela: "webhook_sources",
    razao:
      "tests/invariants/webhooks-rls.test.ts (\"manager B (org B) NÃO vê " +
      "webhook_source/automation_rule da org A\") prova isolamento com " +
      "`countAs` real.",
  },
  {
    tabela: "automation_rules",
    razao: "tests/invariants/webhooks-rls.test.ts — mesmo caso da linha acima.",
  },
  {
    tabela: "automation_rule_runs",
    razao:
      "tests/invariants/webhooks-rls.test.ts (\"service_role insere " +
      "automation_rule_runs na org A; manager B não vê, manager A vê\").",
  },
  {
    tabela: "mercos_import_runs",
    razao:
      "tests/invariants/mercos-import-runs-rls.test.ts — JWT simulado e " +
      "contagem cross-org nas duas direções (A não lê B, B não lê A).",
  },
  {
    tabela: "calendar_event_types",
    razao:
      "tests/invariants/agenda-rls.test.ts — `TABELAS_DA_AGENDA`, com " +
      "`it.each` provando 0 linhas cross-org nos dois sentidos (A→B e B→A).",
  },
  {
    tabela: "calendar_appointments",
    razao: "tests/invariants/agenda-rls.test.ts — mesmo `it.each` de TABELAS_DA_AGENDA.",
  },
  {
    tabela: "calendar_availability_exceptions",
    razao: "tests/invariants/agenda-rls.test.ts — mesmo `it.each` de TABELAS_DA_AGENDA.",
  },
  {
    tabela: "calendar_connections",
    razao:
      "tests/invariants/agenda-rls.test.ts — TABELAS_DA_AGENDA prova o " +
      "isolamento cross-org, e o describe seguinte (\"o gate de papel que as " +
      "outras cinco não têm\") ainda prova o gate de dono/role por cima.",
  },
  {
    tabela: "calendar_connection_calendars",
    razao: "tests/invariants/agenda-rls.test.ts — mesmo `it.each` de TABELAS_DA_AGENDA.",
  },
  {
    tabela: "calendar_external_events",
    razao: "tests/invariants/agenda-rls.test.ts — mesmo `it.each` de TABELAS_DA_AGENDA.",
  },
  {
    tabela: "followup_flow_versions",
    razao:
      "tests/invariants/followup-schema.test.ts — `FOLLOWUP_TABLES`, com " +
      "\"user of org A reads 0 rows of org B\" por tabela (mesmo molde de " +
      "rls-isolation.test.ts).",
  },
  {
    tabela: "followup_flow_pointers",
    razao: "tests/invariants/followup-schema.test.ts — mesmo laço de FOLLOWUP_TABLES.",
  },
  {
    tabela: "followup_enrollments",
    razao: "tests/invariants/followup-schema.test.ts — mesmo laço de FOLLOWUP_TABLES.",
  },
  {
    tabela: "followup_enrollment_events",
    razao: "tests/invariants/followup-schema.test.ts — mesmo laço de FOLLOWUP_TABLES.",
  },
  {
    tabela: "user_organizations",
    razao:
      "tests/invariants/gov-1b-team-manager-read.test.ts (\"cross-org: " +
      "manager da org A NÃO lê linhas da org B (0 rows)\") prova isolamento " +
      "com `countAs` real, além do self-read do agent.",
  },
  {
    tabela: "fiscal_certificates",
    razao:
      "tests/invariants/fiscal-entrada-modulo-0290.test.ts — `countAs` do " +
      "agent B contra a org A (0 linhas) e `writeCountAs` provando que o " +
      "agent não troca o certificado (manager troca).",
  },
  {
    tabela: "fiscal_document_items",
    razao:
      "tests/invariants/fiscal-entrada-modulo-0290.test.ts — leitura " +
      "cross-org com `countAs` (A lê 1, B lê 0) e INSERT do agent recusado " +
      "(escrita é do sync, via service_role).",
  },
  {
    tabela: "fiscal_document_events",
    razao:
      "tests/invariants/fiscal-entrada-modulo-0290.test.ts — mesmo par " +
      "`countAs`/`writeCountAs`, e o replay por (org, chave, NSU) não duplica.",
  },
  {
    tabela: "fiscal_manifestations",
    razao:
      "tests/invariants/fiscal-entrada-modulo-0290.test.ts — isolamento " +
      "cross-org e a regra de papel na policy: ciência do agent passa, " +
      "confirmação do agent não (manager passa).",
  },
  {
    tabela: "fiscal_sync_logs",
    razao:
      "tests/invariants/fiscal-entrada-modulo-0290.test.ts — `countAs` " +
      "cross-org (B lê 0 da org A) e `writeCountAs` do agent recusado: o log " +
      "é escrito pelo serviço, não pelo navegador.",
  },
  {
    tabela: "endereco_entradas",
    razao:
      "tests/invariants/entrada-do-endereco.test.ts — `countAs` do agent B " +
      "vê 0 linhas da org A, `writeCountAs` recusa escrita cross-org e " +
      "viewer não escreve nem na própria org (migration 0311).",
  },
  // F-17 — 39 tabelas que estavam em DEBITO_CONHECIDO e ganharam prova
  // comportamental real (JWT simulado + contagem cross-org + controle positivo)
  // em rls-camadas-restantes-do-debito.test.ts. A lista vive em módulo próprio
  // para os dois arquivos lerem a MESMA fonte.
  ...TABELAS_PROVADAS_AQUI.map((tabela) => ({
    tabela,
    razao:
      "tests/invariants/rls-camadas-restantes-do-debito.test.ts — admin da org D " +
      "lê 0 linhas da org E e ≥1 da própria org, por tabela (F-17).",
  })),
];

/**
 * Tabelas que SAÍRAM da dívida e agora têm prova comportamental em
 * `rls-varredura-comportamental.test.ts` (seed de uma linha por organização +
 * JWT simulado + contagem cross-org nos eixos de leitura E escrita).
 *
 * A lista vive em `_rls-varredura-tabelas.ts` porque é o contrato de seed
 * daquele arquivo: se ela crescer sem que a varredura saiba semear, o controle
 * positivo de lá reprova. Aqui ela só é reconhecida como classe de exceção.
 */
/**
 * F-17 — a dívida foi PAGA, e por duas frentes que se somam:
 *
 *   - `rls-camadas-restantes-do-debito.test.ts` provou 39 tabelas nos eixos de
 *     LEITURA (cross-org = 0 e controle positivo), com admin de duas orgs;
 *   - `rls-varredura-comportamental.test.ts` prova as 73 nos QUATRO eixos
 *     (SELECT/UPDATE/DELETE cross-org e INSERT cross-org recusado), com seed
 *     próprio por tabela.
 *
 * A lista de 73 vive em `_rls-varredura-tabelas.ts` porque é o contrato de seed
 * daquele arquivo: se ela crescer sem que a varredura saiba semear, o controle
 * positivo de lá reprova. `DEBITO_CONHECIDO` deixou de existir — não há tabela
 * tenant-aware neste repositório sem prova comportamental.
 */
const PROVADA_POR_VARREDURA: readonly Excecao[] = TABELAS_DA_VARREDURA.map(
  (tabela) => ({
    tabela,
    razao:
      "tests/invariants/rls-varredura-comportamental.test.ts — linha semeada em 2 " +
      "organizações, JWT de admin, contagem cross-org em SELECT/UPDATE/DELETE e " +
      "INSERT cross-org recusado.",
  }),
);

interface TabelaOrg {
  readonly tabela: string;
  readonly rlsLigada: boolean;
}

/** Toda tabela BASE de `public` que tem uma coluna `organization_id`. */
function inventario(): TabelaOrg[] {
  const out = sql(`
    select c.relname || '\t' || c.relrowsecurity::text
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid
                         and a.attname = 'organization_id' and a.attnum > 0
     where n.nspname = 'public' and c.relkind = 'r'
     order by 1;
  `);
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "")
    .map((linha) => {
      // `relrowsecurity::text` — CAST explícito — produz 'true'/'false', não
      // o 't'/'f' que o psql imprime para uma coluna boolean CRUA. Comparar
      // com "t" (o hábito de quem já leu boolean de psql direto) reprova toda
      // tabela em massa por instrumento cego, não por RLS desligada — foi
      // medido rodando este arquivo. `hardening-definer-varredura.test.ts` já
      // acerta isso comparando com "true"; aqui é o mesmo cast.
      const [tabela, rls] = linha.split("\t");
      return { tabela: (tabela ?? "").trim(), rlsLigada: (rls ?? "").trim() === "true" };
    });
}

describe("varredura: completude de RLS sobre toda tabela com organization_id", () => {
  it("o inventário não vem vazio (guarda de vacuidade)", () => {
    // Mesma razão de ser do caso análogo em hardening-definer-varredura.test.ts:
    // sem isto, um catálogo que deixasse de casar (coluna renomeada, schema
    // trocado) faria as asserções abaixo passarem por AUSÊNCIA de dado. O
    // número é o medido em 2026-08-27 (102 tabelas); a asserção é de ordem de
    // grandeza, não de igualdade, para não reprovar a cada tabela nova.
    expect(inventario().length).toBeGreaterThanOrEqual(90);
  });

  it("toda tabela com organization_id tem row level security LIGADA", () => {
    const sem = inventario()
      .filter((t) => !t.rlsLigada)
      .map((t) => t.tabela);
    expect(
      sem,
      "Tabela com `organization_id` e SEM RLS: alcançável pelo PostgREST com " +
        "a anon key + o JWT de qualquer usuário logado. Acrescente `alter " +
        "table ... enable row level security` na migration.",
    ).toEqual([]);
  });

  it("toda tabela tenant-aware tem prova comportamental — TABLES, PROVA_PROPRIA ou a varredura", () => {
    // Este é o caso que fecha o buraco de verdade: RLS ligada (caso acima) não
    // é isolamento provado — só a forma que o isolamento tem que ter. Uma
    // tabela só passa aqui se estiver em TABLES (teste comportamental de
    // verdade), em PROVA_PROPRIA (teste comportamental em outro arquivo,
    // citado) ou em PROVADA_POR_VARREDURA (a varredura comportamental semeia e
    // mede os quatro eixos). A antiga lista `DEBITO_CONHECIDO` — que nomeava
    // tabela sem prova — não existe mais: as 73 que estavam lá agora são
    // medidas em `rls-varredura-comportamental.test.ts`.
    const conhecidas = new Set<string>([
      ...TABLES,
      ...PROVA_PROPRIA.map((e) => e.tabela),
      ...PROVADA_POR_VARREDURA.map((e) => e.tabela),
    ]);
    const semRegistro = inventario()
      .map((t) => t.tabela)
      .filter((tabela) => !conhecidas.has(tabela));
    expect(
      semRegistro,
      "Tabela tenant-aware NOVA sem prova comportamental nenhuma. Acrescente " +
        "a tabela em TABLES (tests/invariants/rls-isolation.test.ts) com um " +
        "teste `set role authenticated` + JWT + contagem cross-org, no MESMO " +
        "commit da migration — ou, se já existir teste assim em outro " +
        "arquivo, declare em PROVA_PROPRIA (neste arquivo) citando-o, ou " +
        "semeie-a em `_rls-varredura-tabelas.ts` e a varredura comportamental " +
        "a mede nos quatro eixos.",
    ).toEqual([]);
  });

  it("as exceções de PROVA_PROPRIA ainda existem e ainda têm RLS ligada", () => {
    // As duas mortes de sempre: exceção para tabela que sumiu vira ruído que
    // ninguém apaga; exceção para tabela que perdeu RLS finge segurança que já
    // não existe.
    const porTabela = new Map(inventario().map((t) => [t.tabela, t]));
    for (const { tabela } of PROVA_PROPRIA) {
      const achada = porTabela.get(tabela);
      expect(achada, `PROVA_PROPRIA cita tabela inexistente: ${tabela}`).toBeDefined();
      expect(
        achada?.rlsLigada,
        `${tabela} está em PROVA_PROPRIA mas perdeu RLS — não é mais exceção, é tabela exposta`,
      ).toBe(true);
    }
  });

  it("as exceções de PROVADA_POR_VARREDURA ainda existem e ainda têm RLS ligada", () => {
    const porTabela = new Map(inventario().map((t) => [t.tabela, t]));
    for (const { tabela } of PROVADA_POR_VARREDURA) {
      const achada = porTabela.get(tabela);
      expect(
        achada,
        `PROVADA_POR_VARREDURA cita tabela inexistente: ${tabela} — remova a entrada de _rls-varredura-tabelas.ts`,
      ).toBeDefined();
      expect(
        achada?.rlsLigada,
        `${tabela} está na varredura comportamental mas perdeu RLS — isto não é mais falta de teste, é tabela exposta`,
      ).toBe(true);
    }
  });
});
