/**
 * O preâmbulo do Postgres descartável tem UM texto só.
 *
 * POR QUE ESTE GATE EXISTE
 *
 * Existem dois consumidores do mesmo conceito — "que objetos um Postgres limpo
 * precisa ter para ser o banco do produto antes de qualquer SQL nosso":
 *
 *   * `scripts/test-db.sh`, o gate obrigatório `invariants` do CI;
 *   * `scripts/auditoria/replay-migrations.sh`, o instrumento da auditoria AAA.
 *
 * Até 2026-11-15 eram dois heredocs independentes. O do replay ficou menor:
 * faltavam `file_size_limit`/`allowed_mime_types` em `storage.buckets`,
 * `citext`, `pg_trgm`, o schema `extensions`, o DEFAULT ACL de funções e a
 * publicação `supabase_realtime`. Resultado medido: as migrations 0014, 0017 e
 * 0025 apareceram como **quebradas** no relatório da auditoria — e não estavam.
 * O defeito era do instrumento, e o achado tinha cara de defeito do produto.
 *
 * Esse é o modo de falha mais caro de uma auditoria: um instrumento que mede um
 * universo diferente do universo do gate produz números que ninguém pode
 * contestar porque ninguém sabe que a régua era outra. A correção é estrutural
 * — um arquivo, dois consumidores — e é isso que este gate mantém.
 *
 * O QUE ELE NÃO É
 *
 * Não aplica SQL nem valida sintaxe. É uma catraca de COMPOSIÇÃO: os dois
 * consumidores precisam apontar para o mesmo arquivo, e o arquivo precisa
 * conter as peças cuja ausência já produziu achado falso. Quem aplica de
 * verdade é o `test:db` (gate) e o replay (instrumento).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "../..");
const LER = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

const PREAMBULO = "scripts/sql/preambulo-supabase-descartavel.sql";
const GATE = "scripts/test-db.sh";
const REPLAY = "scripts/auditoria/replay-migrations.sh";

describe("preâmbulo do banco descartável", () => {
  it("o gate e o instrumento consomem o MESMO arquivo", () => {
    for (const consumidor of [GATE, REPLAY]) {
      expect(LER(consumidor), `${consumidor} deveria ler ${PREAMBULO}`).toContain(
        "preambulo-supabase-descartavel.sql",
      );
    }
  });

  it("nenhum consumidor voltou a embutir uma cópia do preâmbulo", () => {
    // A cópia embutida é reconhecida pela primeira peça que o stub do replay
    // tinha e o do gate não: a tabela `storage.buckets`. Se alguém recolar um
    // heredoc com SQL do preâmbulo, este teste acusa antes do relatório mentir.
    for (const consumidor of [GATE, REPLAY]) {
      expect(
        LER(consumidor),
        `${consumidor} tem SQL de preâmbulo embutido — o texto tem de viver só em ${PREAMBULO}`,
      ).not.toMatch(/create table if not exists storage\.buckets/i);
    }
  });

  it("contém as peças cuja ausência já produziu achado falso", () => {
    const sql = LER(PREAMBULO);

    // storage.buckets com as colunas que as migrations 0014/0017 inserem.
    expect(sql).toMatch(/file_size_limit\s+bigint/);
    expect(sql).toMatch(/allowed_mime_types\s+text\[\]/);

    // extensões que o baseline referencia mas não cria (pg_dump).
    for (const ext of ["uuid-ossp", "pgcrypto", "vector", "citext", "pg_trgm"]) {
      expect(sql, `extensão ${ext} ausente do preâmbulo`).toContain(ext);
    }

    // DEFAULT ACL de funções: sem ele o banco efêmero não é o do produto e o
    // job `invariants` mede um universo onde o defeito não pode existir.
    expect(sql).toMatch(/alter default privileges .* grant all on functions to anon/i);

    // A publicação que o bootstrap do Supabase cria e que a migration 0025 altera.
    expect(sql).toMatch(/supabase_realtime/);

    // auth.uid() fiel ao GoTrue: o `nullif` protege o CAST, não o resultado.
    expect(sql).toMatch(/nullif\(current_setting\('request\.jwt\.claims', true\), ''\)::jsonb/);
  });
});
