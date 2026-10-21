import { describe, expect, it } from "vitest";

import { countAs, sql } from "./gov-helpers";

/**
 * 0278 · o histórico da importação do Mercos é de cada organização.
 *
 * `mercos_import_runs` guarda quem pediu, o que entrou e o que falhou — e o
 * worker a lê com service role. A policy de SELECT é a única porta para o
 * navegador; se ela vazar, o tenant B vê a rotina e os números do tenant A.
 *
 * A prova é comportamental: JWT simulado, `set role authenticated` e contagem
 * cross-org nas duas direções. Não basta `relrowsecurity = true` — a varredura
 * de completude já explicou por que catálogo não é prova.
 *
 * Namespace pela migration (`0278aaaa`/`0278bbbb`), como as demais provas, para
 * não colidir com orgs de outros arquivos que rodam em paralelo.
 */
const MI_ORG_A = "0278aaaa-0000-4000-8000-000000000001";
const MI_ORG_B = "0278bbbb-0000-4000-8000-000000000002";
const MI_MEMBER_A = "0278aaaa-1111-4000-8000-000000000001";
const MI_MEMBER_B = "0278bbbb-1111-4000-8000-000000000002";

function seed(): void {
  sql(`
    insert into auth.users (id, email) values
      ('${MI_MEMBER_A}', 'mercos-runs-a@invariant.test'),
      ('${MI_MEMBER_B}', 'mercos-runs-b@invariant.test')
      on conflict do nothing;
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${MI_ORG_A}', 'mercos-runs-a', 'Mercos Runs A', 'Mercos Runs A'),
      ('${MI_ORG_B}', 'mercos-runs-b', 'Mercos Runs B', 'Mercos Runs B')
      on conflict do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${MI_MEMBER_A}', '${MI_ORG_A}', 'manager', now()),
      ('${MI_MEMBER_B}', '${MI_ORG_B}', 'manager', now())
      on conflict do nothing;
    insert into public.mercos_import_runs (organization_id, status, origem, summary)
    values
      ('${MI_ORG_A}', 'success', 'manual', '{"orders_new": 7}'::jsonb),
      ('${MI_ORG_B}', 'success', 'cron', '{"orders_new": 3}'::jsonb)
    on conflict do nothing;
  `);
}

describe("0278 · histórico de importação do Mercos isola por organização", () => {
  it("a tabela nasce com RLS ligada e a policy de leitura por tenant", () => {
    seed();
    expect(sql(`select relrowsecurity from pg_class where relname = 'mercos_import_runs'`)).toBe(
      "t",
    );
    expect(
      sql(`select policyname from pg_policies
            where schemaname = 'public' and tablename = 'mercos_import_runs' order by 1`),
    ).toBe("mercos_import_runs_select");
  });

  it("membro da org A lê a própria execução", () => {
    expect(
      countAs(
        MI_MEMBER_A,
        `select count(*) from public.mercos_import_runs where organization_id = '${MI_ORG_A}';`,
      ),
    ).toBe(1);
  });

  it("membro da org B NÃO lê a execução da org A", () => {
    expect(
      countAs(
        MI_MEMBER_B,
        `select count(*) from public.mercos_import_runs where organization_id = '${MI_ORG_A}';`,
      ),
    ).toBe(0);
  });

  it("membro da org A NÃO lê a execução da org B", () => {
    expect(
      countAs(
        MI_MEMBER_A,
        `select count(*) from public.mercos_import_runs where organization_id = '${MI_ORG_B}';`,
      ),
    ).toBe(0);
  });
});
