import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

/**
 * `comando_da_conversa` É FUNÇÃO, NÃO COLUNA — e o gerador de tipos mente.
 *
 * ═══ POR QUE ISTO É INVARIANTE E NÃO TESTE DE UNIDADE ═════════════════════
 *
 * `lib/database.types.ts` lista `comando_da_conversa` como campo da Row de
 * `conversations`. Lê-lo e concluir que a coluna existe é o caminho natural —
 * e está errado. `supabase gen types` inclui função exposta pelo PostgREST no
 * shape do schema, porque o PostgREST a devolve como coluna virtual.
 *
 * A consequência é uma classe de bug que nenhum typecheck pega:
 *
 *   rota escreve `comando_da_conversa: "encerrada"`
 *     → TS aceita (o tipo declara o campo)
 *     → `supabase gen types` concorda
 *     → Postgres responde `column does not exist`
 *     → 500, e a ação inteira não acontece
 *
 * Medido nesta instalação em 13/10/2026: a função existe
 * (`pg_proc` = 2 entradas), a coluna não existe em `pg_attribute`. A rota de
 * arquivar o inbox foi escrita com o campo e cairia com 500 em toda
 * instalação — inclusive na de produção.
 *
 * Este teste roda contra o Postgres de verdade (o mesmo que `baseline.sql`
 * aplica), então é ele que separa "o tipo diz" de "o banco tem".
 */
const container = process.env.TEST_DB_CONTAINER;
if (!container) throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db`");
const containerName: string = container;

function linhas(q: string): string[] {
  return execFileSync(
    "docker",
    ["exec", "-i", containerName, "psql", "-U", "postgres", "-d", "postgres", "-tA", "-c", q],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

describe("comando_da_conversa é função, não coluna", () => {
  it("existe como FUNCAO que recebe a linha da conversa", () => {
    const achadas = linhas(`
      select p.proname
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('comando_da_conversa', 'fn_comando_da_conversa')
    `);
    // As DUAS: a regra (`fn_comando_da_conversa`) e a exposição
    // (`comando_da_conversa(c conversations)`). Sem a segunda, o
    // `?select=comando_da_conversa` do inbox para de funcionar.
    expect(achadas).toContain("comando_da_conversa");
    expect(achadas).toContain("fn_comando_da_conversa");
  });

  it("NAO existe como coluna de conversations", () => {
    const colunas = linhas(`
      select a.attname
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
       where n.nspname = 'public' and c.relname = 'conversations'
         and a.attname = 'comando_da_conversa'
    `);
    // Vazio é o resultado CORRETO. Se esta lista crescer, é porque alguém
    // adicionou a coluna de verdade — e aí os dois lados mudam de regra.
    expect(colunas).toEqual([]);
  });

  it("a rota de arquivar o inbox nao escreve a função como coluna", () => {
    // A mesma defesa do lado do código, com o banco autorizando a verdade.
    const colunas = linhas(`
      select a.attname
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
       where n.nspname = 'public' and c.relname = 'conversations'
         and a.attname in ('status', 'status_changed_at', 'unread_count_for_assignee')
    `);
    expect(colunas.sort()).toEqual(["status", "status_changed_at", "unread_count_for_assignee"]);
  });

  it("a função devolve um valor para uma linha real — nao e stub", () => {
    const r = linhas(`select public.comando_da_conversa(c::public.conversations)
                        from public.conversations c limit 1`);
    // Com 0 conversas a lista vem vazia e nao ha o que afirmar: o banco de
    // teste pode estar sem seed. Com linhas, o valor tem de ser um dos quatro
    // do CHECK (migration 0203).
    if (r.length === 0) return;
    expect(["humano", "automatico", "aguardando", "encerrada"]).toContain(r[0]);
  });
});
