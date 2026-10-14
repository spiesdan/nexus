import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

/**
 * O fechamento de carga (0268) no banco.
 *
 * ═══ POR QUE UM INVARIANTE E NÃO SÓ UM TESTE DE SQL ═══════════════════════
 *
 * Porque as duas portas do erro são silenciosas. A tabela pode existir com RLS
 * desligado, e nenhuma tela quebra — a tela só passa a expor a tabela inteira
 * para quem tem a anon key. E a coluna `conferido` pode não existir, e a
 * conferência do romaneio simplesmente deixa de ter onde marcar.
 *
 * Nenhuma das duas aparece em `pnpm test:unit`, e as duas aparecem no pior
 * lugar: em produção, com dado de outro tenant.
 */
const container = process.env.TEST_DB_CONTAINER;
if (!container) throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db`");
const containerName: string = container;

function q(sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", containerName, "psql", "-U", "postgres", "-d", "postgres", "-tA", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

describe("0268 — fechamento de carga", () => {
  it("a tabela existe", () => {
    expect(
      q(`select count(*) from information_schema.tables
          where table_schema = 'public' and table_name = 'shipment_closings'`),
    ).toBe("1");
  });

  it("RLS está LIGADO — sem isso a tabela inteira vaza para quem tem a anon key", () => {
    expect(q(`select relrowsecurity from pg_class where relname = 'shipment_closings'`)).toBe("t");
  });

  it("as quatro políticas de tenant existem", () => {
    const nomes = q(
      `select policyname from pg_policies
        where schemaname = 'public' and tablename = 'shipment_closings' order by policyname`,
    )
      .split("\n")
      .filter(Boolean);
    expect(nomes).toEqual([
      "shipment_closings_delete",
      "shipment_closings_insert",
      "shipment_closings_select",
      "shipment_closings_update",
    ]);
  });

  it("anon NÃO lê e NÃO escreve a tabela", () => {
    // A porta que este apêndice fecha SOZINHO. O bloco de varredura `anon` do
    // baseline roda ANTES deste apêndice — então o revoke precisa estar dentro
    // dele, e este teste existe para ninguém "simplificar" o revoke achando que
    // a varredura já cobre.
    const leitura = q(
      `select has_table_privilege('anon', 'public.shipment_closings', 'select')::text`,
    );
    const escrita = q(
      `select has_table_privilege('anon', 'public.shipment_closings', 'insert')::text`,
    );
    expect(leitura).toBe("false");
    expect(escrita).toBe("false");
  });

  it("`conferido` existe em shipment_orders, NOT NULL, default falso", () => {
    // O ☐ do romaneio. Nasce desmarcado: carga concluída sem conferência é o
    // estado normal, não um erro.
    const saida = q(
      `select is_nullable || '|' || coalesce(column_default, '')
         from information_schema.columns
        where table_name = 'shipment_orders' and column_name = 'conferido'`,
    );
    expect(saida).toBe("NO|false");
  });

  it("uma carga tem no máximo um fechamento, e o índice é por shipment_id", () => {
    // Pelo NOME do índice, não pelo prefixo do `indexdef`: `pg_indexes`
    // devolve "CREATE UNIQUE INDEX ...", e um `like 'UNIQUE%'` nunca casa —
    // o teste passaria a medir string vazia. O nome é o que a migration
    // declara, e é estável.
    const def = q(
      `select indexdef from pg_indexes
        where tablename = 'shipment_closings' and indexname = 'shipment_closings_carga_unico'`,
    );
    expect(def).toContain("UNIQUE");
    expect(def).toContain("(shipment_id)");
  });

  it("as somas do caixa não aceitam negativo, mas a DIFERENÇA pode ser", () => {
    // `diferenca_cents` fica fora da trava de propósito: ela é positiva quando
    // sobrou e negativa quando faltou, e as duas são fechamentos legítimos.
    // Prendê-la em `>= 0` proibiria registrar "faltou R$ 40".
    const defs = q(
      `select pg_get_constraintdef(oid) from pg_constraint
        where conrelid = 'shipment_closings'::regclass and contype = 'c'`,
    );
    const caixa = defs.split("\n").find((d) => d.includes("liquido_cents"));
    expect(caixa).toBeDefined();
    expect(caixa).toContain("entradas_cents >= 0");
    expect(caixa).toContain("esperado_cents >= 0");
    expect(caixa).not.toContain("diferenca_cents >= 0");
  });
});