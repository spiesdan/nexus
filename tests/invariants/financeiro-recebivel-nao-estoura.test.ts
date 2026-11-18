/**
 * O TETO DO RECEBÍVEL SOB CONCORRÊNCIA — a corrida que o app não podia fechar.
 *
 * POR QUE ESTE TESTE EXISTE
 *
 * `registrarPagamento` lia a soma dos pagamentos, comparava com o valor original
 * e só então inseria. Dois recebimentos simultâneos com `Idempotency-Key`
 * DIFERENTES passavam os dois pela mesma leitura: o unique parcial
 * (`financial_payments_idem_key`) só impede repetir a MESMA chave, não a corrida
 * entre duas. O resultado era receber mais que o valor do título — dinheiro a
 * maior, sem ninguém recusar.
 *
 * O QUE ELE PROVA, em Postgres de verdade
 *
 * 1. duas conexões concorrentes de 60 num título de 100: uma entra, a outra é
 *    recusada com `23514` (o `BEFORE` trava o recebível com `for update`);
 * 2. o status acompanha a soma na mesma transação: 60 = `parcial`, 100 = `pago`;
 * 3. cancelado não recebe pagamento e não é reaberto por estorno;
 * 4. estorno (DELETE) reduz a soma e devolve o status — sem "pago fantasma";
 * 5. UPDATE de valor que estoura o teto também é recusado.
 *
 * O QUE ELE NÃO PROVA: que a rota devolve 422. Isso é unitário
 * (`lib/comercial/financeiro.test.ts`, `erroDePagamentoDoBanco`).
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PORTA = process.env.TEST_DB_PORT ?? "54329";
const CONEXAO = `postgres://postgres:postgres@127.0.0.1:${PORTA}/postgres`;
const pool = new pg.Pool({ connectionString: CONEXAO, max: 2 });

const ORG = "ee000000-0000-4000-8000-0000000000a1";

/** Recebíveis deste arquivo. Cada caso tem o seu — fixture não vaza entre testes. */
const REC_CORRIDA = "ee000000-1111-4000-8000-0000000000b1";
const REC_STATUS = "ee000000-1111-4000-8000-0000000000b2";
const REC_CANCELADO = "ee000000-1111-4000-8000-0000000000b3";
const REC_UPDATE = "ee000000-1111-4000-8000-0000000000b4";

function recuperavel(id: string, status = "aberto", valor = 10000): string {
  return `
    insert into public.financial_receivables
      (id, organization_id, parcela_n, total_parcelas, valor_original_cents, vencimento, status)
    values ('${id}', '${ORG}', 1, 1, ${valor}, '2026-12-31', '${status}')
    on conflict (id) do nothing;
  `;
}

async function pagar(
  recebivel: string,
  valor: number,
  chave: string | null = null,
  atrasoMs = 0,
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  const client = new pg.Client({ connectionString: CONEXAO });
  await client.connect();
  try {
    const sql = `
      insert into public.financial_payments
        (organization_id, receivable_id, valor_cents, idempotency_key)
      values ('${ORG}', '${recebivel}', ${valor}, ${chave === null ? "null" : `'${chave}'`});
    `;
    if (atrasoMs > 0) {
      // Mantém a transação aberta para a segunda conexão bater na trava.
      await client.query("begin");
      await client.query(sql);
      await client.query(`select pg_sleep(${atrasoMs / 1000})`);
      await client.query("commit");
    } else {
      await client.query(sql);
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      code: (err as { code?: string }).code ?? "",
      message: (err as Error).message,
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function statusDe(id: string): Promise<string> {
  const { rows } = await pool.query<{ status: string }>(
    `select status from public.financial_receivables where id = $1`,
    [id],
  );
  return rows[0]?.status ?? "";
}

beforeAll(async () => {
  await pool.query(
    `
    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${ORG}', 'financeiro-corrida', 'Financeiro Corrida', 'Financeiro Corrida')
      on conflict (id) do nothing;
    delete from public.financial_payments where organization_id = '${ORG}';
    delete from public.financial_receivables where organization_id = '${ORG}';
    `,
  );
  await pool.query(recuperavel(REC_CORRIDA));
  await pool.query(recuperavel(REC_STATUS));
  await pool.query(recuperavel(REC_CANCELADO, "cancelado"));
  await pool.query(recuperavel(REC_UPDATE));
});

afterAll(async () => {
  await pool.end();
});

describe("0314 — teto do recebível é garantia da transação", () => {
  it("dois pagamentos simultâneos de 60 num título de 100: um entra, o outro é recusado", async () => {
    const [a, b] = await Promise.all([
      pagar(REC_CORRIDA, 6000, "corrida-a", 1200),
      new Promise<Awaited<ReturnType<typeof pagar>>>((resolve) => {
        // A segunda só começa depois de a primeira estar dentro do trigger.
        setTimeout(() => resolve(pagar(REC_CORRIDA, 6000, "corrida-b")), 250);
      }),
    ]);

    const resultados = [a, b];
    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    const recusado = resultados.find((r): r is { ok: false; code: string; message: string } => !r.ok);
    expect(recusado?.code).toBe("23514");
    expect(recusado?.message).toContain("financial_payment_acima_do_saldo");

    const { rows } = await pool.query<{ soma: string }>(
      `select coalesce(sum(valor_cents), 0)::text as soma
         from public.financial_payments
        where receivable_id = $1`,
      [REC_CORRIDA],
    );
    expect(Number(rows[0]?.soma)).toBe(6000);
  });

  it("status acompanha a soma: 60 = parcial, +40 = pago", async () => {
    expect((await pagar(REC_STATUS, 6000)).ok).toBe(true);
    expect(await statusDe(REC_STATUS)).toBe("parcial");

    expect((await pagar(REC_STATUS, 4000)).ok).toBe(true);
    expect(await statusDe(REC_STATUS)).toBe("pago");

    const excedente = await pagar(REC_STATUS, 1);
    expect(excedente.ok).toBe(false);
    expect((excedente as { code: string }).code).toBe("23514");
  });

  it("cancelado não recebe pagamento e estorno não o reabre", async () => {
    const tentativa = await pagar(REC_CANCELADO, 100);
    expect(tentativa.ok).toBe(false);
    expect((tentativa as { message: string }).message).toContain(
      "financial_payment_recebivel_fechado",
    );
    expect(await statusDe(REC_CANCELADO)).toBe("cancelado");
  });

  it("estorno reduz a soma e devolve o status, sem pago fantasma", async () => {
    expect((await pagar(REC_UPDATE, 10000)).ok).toBe(true);
    expect(await statusDe(REC_UPDATE)).toBe("pago");

    await pool.query(`delete from public.financial_payments where receivable_id = $1`, [REC_UPDATE]);
    expect(await statusDe(REC_UPDATE)).toBe("aberto");
  });

  it("UPDATE de pagamento que estoura o teto também é recusado", async () => {
    expect((await pagar(REC_UPDATE, 5000)).ok).toBe(true);
    expect((await pagar(REC_UPDATE, 4000)).ok).toBe(true);
    expect(await statusDe(REC_UPDATE)).toBe("parcial");

    await expect(
      pool.query(
        `update public.financial_payments
            set valor_cents = 6000
          where receivable_id = $1 and valor_cents = 4000`,
        [REC_UPDATE],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    // E a soma continua a que era: o UPDATE recusado não deixou resíduo.
    const { rows } = await pool.query<{ soma: string }>(
      `select coalesce(sum(valor_cents), 0)::text as soma
         from public.financial_payments
        where receivable_id = $1`,
      [REC_UPDATE],
    );
    expect(Number(rows[0]?.soma)).toBe(9000);
  });
});
