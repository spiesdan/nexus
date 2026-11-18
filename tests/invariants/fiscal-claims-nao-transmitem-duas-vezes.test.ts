/**
 * O CLAIM DE OPERAÇÃO FISCAL É ATÔMICO (0318) — duas chamadas, uma transmissão.
 *
 * A rota de manifestação e a de cancelamento de nota autorizada transmitem à
 * SEFAZ. O claim é o próprio UPDATE condicional:
 *
 *   SET claim = now()
 *   WHERE id = ? AND (claim IS NULL OR claim < now() - interval '5 min')
 *
 * Este teste abre DUAS conexões em Postgres de verdade. A primeira fica com a
 * linha e segura a transação; a segunda espera e reavalia o WHERE, recebendo
 * 0 linhas — que é o 409 da rota. Também prova a retomada de claim velho
 * (processo morto) e que o status da nota/entrada não é alterado pelo claim.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PORTA = process.env.TEST_DB_PORT ?? "54329";
const CONEXAO = `postgres://postgres:postgres@127.0.0.1:${PORTA}/postgres`;
const pool = new pg.Pool({ connectionString: CONEXAO, max: 2 });

const ORG = "bb000000-0000-4000-8000-0000000000a1";
const ENTRADA = "bb000000-1111-4000-8000-0000000000b1";
const NOTA = "bb000000-2222-4000-8000-0000000000c1";

const SQL_ENTRADA = `
  update public.fiscal_entradas
     set manifestacao_em_andamento_em = now()
   where id = '${ENTRADA}'
     and organization_id = '${ORG}'
     and (manifestacao_em_andamento_em is null
          or manifestacao_em_andamento_em < now() - interval '5 min')`;

const SQL_NOTA = `
  update public.invoices
     set cancelamento_em_andamento_em = now()
   where id = '${NOTA}'
     and organization_id = '${ORG}'
     and status = 'autorizada'
     and (cancelamento_em_andamento_em is null
          or cancelamento_em_andamento_em < now() - interval '5 min')`;

async function reivindicar(sql: string, atrasoMs = 0) {
  const client = new pg.Client({ connectionString: CONEXAO });
  await client.connect();
  try {
    if (atrasoMs > 0) {
      await client.query("begin");
      const r = await client.query(sql);
      await client.query(`select pg_sleep(${atrasoMs / 1000})`);
      await client.query("commit");
      return { linhas: r.rowCount ?? 0 };
    }
    const r = await client.query(sql);
    return { linhas: r.rowCount ?? 0 };
  } finally {
    await client.end().catch(() => undefined);
  }
}

beforeAll(async () => {
  await pool.query(
    `
    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${ORG}', 'claims-fiscais', 'Claims Fiscais', 'Claims Fiscais')
      on conflict (id) do nothing;

    insert into public.fiscal_entradas
      (id, organization_id, chave, nsu, emitente_cnpj, emitente_nome, status)
    values ('${ENTRADA}', '${ORG}', '35261012345678000199550010000012341000012345', 1,
            '12345678000199', 'Fornecedor', 'nova')
    on conflict (id) do nothing;

    insert into public.invoices
      (id, organization_id, serie, total_cents, status)
    values ('${NOTA}', '${ORG}', '1', 1000, 'autorizada')
    on conflict (id) do nothing;

    update public.fiscal_entradas set manifestacao_em_andamento_em = null where id = '${ENTRADA}';
    update public.invoices set cancelamento_em_andamento_em = null, status = 'autorizada' where id = '${NOTA}';
    `,
  );
});

afterAll(async () => {
  await pool.end();
});

describe("0318 — claim de manifestação", () => {
  it("duas conexões simultâneas: só uma reivindica (a outra recebe 0 linhas)", async () => {
    const [a, b] = await Promise.all([
      reivindicar(SQL_ENTRADA, 1200),
      new Promise<{ linhas: number }>((resolve) => {
        setTimeout(() => resolve(reivindicar(SQL_ENTRADA)), 250);
      }),
    ]);
    expect([a.linhas, b.linhas].filter((n) => n === 1)).toHaveLength(1);
    expect([a.linhas, b.linhas].filter((n) => n === 0)).toHaveLength(1);
  });

  it("claim velho (> 5 min) é retomado — processo morto não trava para sempre", async () => {
    await pool.query(
      `update public.fiscal_entradas
          set manifestacao_em_andamento_em = now() - interval '10 min'
        where id = $1`,
      [ENTRADA],
    );
    const r = await reivindicar(SQL_ENTRADA);
    expect(r.linhas).toBe(1);
  });

  it("claim fresco não é retomado", async () => {
    await pool.query(`update public.fiscal_entradas set manifestacao_em_andamento_em = now() where id = $1`, [
      ENTRADA,
    ]);
    const r = await reivindicar(SQL_ENTRADA);
    expect(r.linhas).toBe(0);
  });
});

describe("0318 — claim de cancelamento", () => {
  it("duas conexões simultâneas: só uma reivindica", async () => {
    await pool.query(`update public.invoices set cancelamento_em_andamento_em = null where id = $1`, [NOTA]);
    const [a, b] = await Promise.all([
      reivindicar(SQL_NOTA, 1200),
      new Promise<{ linhas: number }>((resolve) => {
        setTimeout(() => resolve(reivindicar(SQL_NOTA)), 250);
      }),
    ]);
    expect([a.linhas, b.linhas].filter((n) => n === 1)).toHaveLength(1);
    expect([a.linhas, b.linhas].filter((n) => n === 0)).toHaveLength(1);
  });

  it("nota fora de autorizada não pode ser reivindicada", async () => {
    await pool.query(`update public.invoices set cancelamento_em_andamento_em = null, status = 'cancelada' where id = $1`, [
      NOTA,
    ]);
    const r = await reivindicar(SQL_NOTA);
    expect(r.linhas).toBe(0);
  });

  it("o claim não muda o status da nota", async () => {
    await pool.query(`update public.invoices set status = 'autorizada', cancelamento_em_andamento_em = null where id = $1`, [
      NOTA,
    ]);
    await reivindicar(SQL_NOTA);
    const { rows } = await pool.query<{ status: string }>(
      `select status from public.invoices where id = $1`,
      [NOTA],
    );
    expect(rows[0]?.status).toBe("autorizada");
  });
});
