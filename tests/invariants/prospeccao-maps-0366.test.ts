import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * 0366 — checkpoint por termo e travas da prospecção Maps no banco real.
 *
 * O contrato puro (`lib/prospeccao/checkpoint.ts`) não prova que o self-host
 * recebe as colunas: `progresso` é jsonb com default objeto, `motivo_zero` e
 * `degradada` existem, e as travas nascem nos padrões do plano (20/h, 100/dia,
 * 1,5 s). Sem estas colunas, a retomada por termo não tem onde morar.
 */
describe("0366 — prospecção Maps", () => {
  it("prospecting_searches ganha progresso jsonb objeto, motivo_zero e degradada", () => {
    const colunas = sql(`
      select column_name || '|' || data_type || '|' || is_nullable || '|' || coalesce(column_default, '')
        from information_schema.columns
       where table_schema = 'public' and table_name = 'prospecting_searches'
         and column_name in ('progresso', 'motivo_zero', 'degradada')
       order by column_name;
    `);
    expect(colunas).toContain("degradada|boolean|NO|false");
    expect(colunas).toContain("motivo_zero|text|YES|");
    expect(colunas).toContain("progresso|jsonb|NO|'{}'::jsonb");
  });

  it("progresso aceita objeto e recusa array", () => {
    expect(
      sql(`select jsonb_typeof(progresso) from public.prospecting_searches limit 1;`),
    ).not.toBe("array");
    // A constraint é o que impede um checkpoint gravado como lista.
    const def = sql(`
      select pg_get_constraintdef(oid)
        from pg_constraint
       where conrelid = 'public.prospecting_searches'::regclass
         and conname = 'prospecting_searches_progresso_objeto';
    `);
    expect(def).toContain("jsonb_typeof(progresso) = 'object'");
  });

  it("travas nascem nos padrões do plano: 20/h, 100/dia e jitter 1500 ms", () => {
    const defs = sql(`
      select column_name || '|' || coalesce(column_default, '')
        from information_schema.columns
       where table_schema = 'public' and table_name = 'prospecting_settings'
         and column_name in ('limite_buscas_hora', 'limite_buscas_dia', 'jitter_ms')
       order by column_name;
    `);
    expect(defs).toContain("jitter_ms|1500");
    expect(defs).toContain("limite_buscas_dia|100");
    expect(defs).toContain("limite_buscas_hora|20");
  });

  it("as constraints de travas existem e limitam os valores", () => {
    const nomes = sql(`
      select conname from pg_constraint
       where conrelid = 'public.prospecting_settings'::regclass
         and conname in ('prospecting_settings_buscas_positivas', 'prospecting_settings_jitter_faixa')
       order by conname;
    `);
    expect(nomes).toContain("prospecting_settings_buscas_positivas");
    expect(nomes).toContain("prospecting_settings_jitter_faixa");
  });
});
