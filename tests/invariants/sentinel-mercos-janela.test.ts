import { beforeAll, describe, expect, it } from "vitest";

import { lastLine, sql } from "./gov-helpers";

/**
 * Janela da coleta Mercos = horizonte das regras (7 dias), não 30.
 *
 * Produção 1.61.0: 137 execuções em 30 dias, 42 em 7 dias; a coleta de 30 dias
 * com teto 100 truncava e bloqueava o encerramento de tudo. Aqui o banco prova
 * a consulta nova: 7 dias/500 não trunca com o volume real; 600 em 7 dias
 * trunca.
 */
const ORG = "a0340000-0000-4000-8000-000000000001";

function contarNaJanela(dias: number): number {
  return Number(
    lastLine(
      sql(`
        select count(*) from (
          select id from public.mercos_import_runs
           where organization_id = '${ORG}'
             and created_at >= now() - interval '${dias} days'
           order by created_at desc
           limit 501
        ) q;
      `),
    ),
  );
}

beforeAll(() => {
  sql(`
    insert into public.organizations (id, slug, legal_name, display_name)
    values ('${ORG}', 'mercos-janela', 'Mercos Janela', 'Mercos Janela')
    on conflict (id) do nothing;
    delete from public.mercos_import_runs where organization_id = '${ORG}';

    -- 42 dentro de 7 dias + 95 entre 7 e 30 = 137 em 30 dias (o caso real).
    insert into public.mercos_import_runs
      (organization_id, status, origem, created_at, finished_at)
    select '${ORG}', 'success', 'cron',
           now() - (g || ' hours')::interval,
           now() - (g || ' hours')::interval
      from generate_series(1, 42) g;
    insert into public.mercos_import_runs
      (organization_id, status, origem, created_at, finished_at)
    select '${ORG}', 'success', 'cron',
           now() - ((7 * 24) + g) * interval '1 hour',
           now() - ((7 * 24) + g) * interval '1 hour'
      from generate_series(1, 95) g;
  `);
});

describe("coleta Mercos — janela das regras", () => {
  it("137 em 30 dias não truncam: só 42 estão na janela de 7 dias", () => {
    expect(contarNaJanela(30)).toBe(137);
    expect(contarNaJanela(7)).toBe(42);
    expect(contarNaJanela(7)).toBeLessThanOrEqual(500);
  });

  it("600 em 7 dias ainda truncam no teto de 500", () => {
    sql(`
      insert into public.mercos_import_runs
        (organization_id, status, origem, created_at, finished_at)
      select '${ORG}', 'success', 'cron',
             now() - (g || ' minutes')::interval,
             now() - (g || ' minutes')::interval
        from generate_series(1, 558) g;
    `);
    expect(contarNaJanela(7)).toBe(501);
  });
});
