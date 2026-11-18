/**
 * O RECEBÍVEL GERADO PELA NF-E NÃO DUPLICA (D1) — a garantia é do banco.
 *
 * Desde 18/11/2026 a autorização da NF-e chama o MESMO `gerarRecebiveis` do
 * PATCH de faturamento. A função pula parcela já existente e trata `23505`
 * como "alguém chegou primeiro". Isso só vale porque o banco tem a unique
 * `(organization_id, order_id, parcela_n)` (0233) — sem ela, dois drains ou
 * um drain + um clique gerariam duas dívidas para o mesmo pedido.
 *
 * O teste exercita a unique em Postgres de verdade, com duas conexões
 * simultâneas. Não toca em nada do fluxo fiscal além da tabela financeira.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PORTA = process.env.TEST_DB_PORT ?? "54329";
const CONEXAO = `postgres://postgres:postgres@127.0.0.1:${PORTA}/postgres`;
const pool = new pg.Pool({ connectionString: CONEXAO, max: 2 });

const ORG = "aa000000-0000-4000-8000-0000000000d1";
const PEDIDO = "aa000000-1111-4000-8000-0000000000d1";

function inserir(parcela: number): string {
  return `
    insert into public.financial_receivables
      (organization_id, order_id, contact_id, parcela_n, total_parcelas,
       valor_original_cents, vencimento, status)
    values ('${ORG}', '${PEDIDO}', null, ${parcela}, 3, 33333, '2026-12-31', 'aberto');
  `;
}

async function inserirConcorrente(parcela: number, atrasoMs = 0) {
  const client = new pg.Client({ connectionString: CONEXAO });
  await client.connect();
  try {
    if (atrasoMs > 0) {
      await client.query("begin");
      await client.query(inserir(parcela));
      await client.query(`select pg_sleep(${atrasoMs / 1000})`);
      await client.query("commit");
    } else {
      await client.query(inserir(parcela));
    }
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, code: (err as { code?: string }).code ?? "" };
  } finally {
    await client.end().catch(() => undefined);
  }
}

beforeAll(async () => {
  await pool.query(
    `
    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${ORG}', 'recebivel-da-nfe', 'Recebível da NF-e', 'Recebível da NF-e')
      on conflict (id) do nothing;
    insert into public.commercial_orders (id, organization_id, numero, cliente_nome, status, total_cents)
      values ('${PEDIDO}', '${ORG}', 9001, 'Cliente D1', 'faturado', 100000)
      on conflict (id) do nothing;
    delete from public.financial_receivables where organization_id = '${ORG}';
    `,
  );
});

afterAll(async () => {
  await pool.end();
});

describe("recebível gerado pela NF-e — unique (org, pedido, parcela)", () => {
  it("duas conexões simultâneas na parcela 1: uma entra, a outra é 23505", async () => {
    const [a, b] = await Promise.all([
      inserirConcorrente(1, 1200),
      new Promise<Awaited<ReturnType<typeof inserirConcorrente>>>((resolve) => {
        setTimeout(() => resolve(inserirConcorrente(1)), 250);
      }),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect([a, b].find((r) => !r.ok)).toMatchObject({ code: "23505" });
  });

  it("retry da mesma parcela rebate na unique", async () => {
    await expect(pool.query(inserir(1))).rejects.toMatchObject({ code: "23505" });
  });

  it("parcela seguinte do mesmo pedido é permitida", async () => {
    await pool.query(inserir(2));
    const { rows } = await pool.query<{ n: number }>(
      `select count(*)::int as n from public.financial_receivables
        where organization_id = $1 and order_id = $2`,
      [ORG, PEDIDO],
    );
    expect(rows[0]?.n).toBe(2);
  });

  it("mesma parcela de OUTRO pedido não colide", async () => {
    const outro = "aa000000-1111-4000-8000-0000000000d2";
    await pool.query(
      `insert into public.commercial_orders (id, organization_id, numero, cliente_nome, status, total_cents)
         values ($1, $2, 9002, 'Cliente D1 B', 'faturado', 50000)
       on conflict (id) do nothing`,
      [outro, ORG],
    );
    await pool.query(
      `insert into public.financial_receivables
        (organization_id, order_id, parcela_n, total_parcelas, valor_original_cents, vencimento)
       values ($1, $2, 1, 1, 50000, '2026-12-31')`,
      [ORG, outro],
    );
    const { rows } = await pool.query<{ n: number }>(
      `select count(*)::int as n from public.financial_receivables
        where organization_id = $1 and parcela_n = 1`,
      [ORG],
    );
    expect(rows[0]?.n).toBe(2);
  });
});
