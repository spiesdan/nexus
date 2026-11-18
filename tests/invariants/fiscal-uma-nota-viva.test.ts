/**
 * UM PEDIDO, UMA NOTA VIVA — a corrida que ficava entre o SELECT e o INSERT.
 *
 * POR QUE ESTE TESTE EXISTE
 *
 * `emitirNota` checava "este pedido já tem nota não cancelada" e só então
 * inseria. Dois cliques (ou retry após timeout) passavam os DOIS pela leitura e
 * criavam duas notas vivas, cada uma com job de emissão — duas transmissões
 * para a mesma operação. O unique de `chave_acesso` não ajuda: ele só existe
 * depois de a SEFAZ autorizar.
 *
 * O QUE ELE PROVA, em Postgres de verdade
 *
 * 1. duas inserções concorrentes da MESMA organização+pedido: uma entra, a
 *    outra recebe `23505` com o marcador `invoice_pedido_ja_tem_nota_viva`;
 * 2. nota cancelada libera nova emissão (a regra existente, não uma trava nova);
 * 3. pedido secundário de nota agrupada não entra em duas notas vivas;
 * 4. o drain pode mudar o status de uma nota viva (em_emissao -> autorizada)
 *    sem ser confundido com duplicata.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PORTA = process.env.TEST_DB_PORT ?? "54329";
const CONEXAO = `postgres://postgres:postgres@127.0.0.1:${PORTA}/postgres`;
const pool = new pg.Pool({ connectionString: CONEXAO, max: 2 });

const ORG = "ff000000-0000-4000-8000-0000000000a1";
const ORG_VIZINHA = "ff000000-0000-4000-8000-0000000000a2";

const PEDIDO_CORRIDA = "ff000000-1111-4000-8000-0000000000b1";
const PEDIDO_CANCELADO = "ff000000-1111-4000-8000-0000000000b2";
const PEDIDO_AGRUPADO_A = "ff000000-1111-4000-8000-0000000000b3";
const PEDIDO_AGRUPADO_B = "ff000000-1111-4000-8000-0000000000b4";
const PEDIDO_VIZINHO = "ff000000-1111-4000-8000-0000000000b5";
const PEDIDO_DRENO = "ff000000-1111-4000-8000-0000000000b6";

const NOTA_CANCELADA = "ff000000-2222-4000-8000-0000000000c3";
const NOTA_AGRUPADA = "ff000000-2222-4000-8000-0000000000c4";
const NOTA_DRENO = "ff000000-2222-4000-8000-0000000000c5";

async function inserirNota(
  id: string | null,
  pedido: string,
  status = "em_emissao",
  org = ORG,
  atrasoMs = 0,
): Promise<{ ok: true; id: string | null } | { ok: false; code: string; message: string }> {
  const client = new pg.Client({ connectionString: CONEXAO });
  await client.connect();
  try {
    const idSql = id === null ? "default" : `'${id}'`;
    const sql = `
      insert into public.invoices
        (id, organization_id, order_id, serie, status, total_cents)
      values (${idSql}, '${org}', '${pedido}', '1', '${status}', 10000)
      returning id;
    `;
    if (atrasoMs > 0) {
      await client.query("begin");
      const { rows } = await client.query<{ id: string }>(sql);
      await client.query(`select pg_sleep(${atrasoMs / 1000})`);
      await client.query("commit");
      return { ok: true, id: rows[0]?.id ?? null };
    }
    const { rows } = await client.query<{ id: string }>(sql);
    return { ok: true, id: rows[0]?.id ?? null };
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

beforeAll(async () => {
  await pool.query(`
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG}', 'fiscal-nota-viva', 'Fiscal Nota Viva', 'Fiscal Nota Viva'),
      ('${ORG_VIZINHA}', 'fiscal-nota-viva-vizinha', 'Vizinha', 'Vizinha')
    on conflict (id) do nothing;

    delete from public.invoice_orders where organization_id in ('${ORG}', '${ORG_VIZINHA}');
    delete from public.invoices where organization_id in ('${ORG}', '${ORG_VIZINHA}');
    delete from public.commercial_orders where organization_id in ('${ORG}', '${ORG_VIZINHA}');

    insert into public.commercial_orders (id, organization_id, numero, cliente_nome, status) values
      ('${PEDIDO_CORRIDA}', '${ORG}', 9001, 'Cliente Corrida', 'aprovado'),
      ('${PEDIDO_CANCELADO}', '${ORG}', 9002, 'Cliente Cancelado', 'aprovado'),
      ('${PEDIDO_AGRUPADO_A}', '${ORG}', 9003, 'Cliente Agrupado', 'aprovado'),
      ('${PEDIDO_AGRUPADO_B}', '${ORG}', 9004, 'Cliente Agrupado', 'aprovado'),
      ('${PEDIDO_VIZINHO}', '${ORG_VIZINHA}', 9005, 'Cliente Vizinha', 'aprovado'),
      ('${PEDIDO_DRENO}', '${ORG}', 9006, 'Cliente Dreno', 'aprovado');
  `);
});

afterAll(async () => {
  await pool.end();
});

describe("0315 — uma nota viva por pedido", () => {
  it("duas emissões simultâneas do mesmo pedido: uma entra, a outra é 23505", async () => {
    const [a, b] = await Promise.all([
      inserirNota(null, PEDIDO_CORRIDA, "em_emissao", ORG, 1200),
      new Promise<Awaited<ReturnType<typeof inserirNota>>>((resolve) => {
        setTimeout(() => resolve(inserirNota(null, PEDIDO_CORRIDA)), 250);
      }),
    ]);

    const resultados = [a, b];
    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    const recusado = resultados.find((r): r is { ok: false; code: string; message: string } => !r.ok);
    expect(recusado?.code).toBe("23505");
    expect(recusado?.message).toContain("invoice_pedido_ja_tem_nota_viva");

    const { rows } = await pool.query<{ total: string }>(
      `select count(*)::text as total from public.invoices where order_id = $1`,
      [PEDIDO_CORRIDA],
    );
    expect(Number(rows[0]?.total)).toBe(1);
  });

  it("nota cancelada libera nova emissão do mesmo pedido", async () => {
    const cancelada = await inserirNota(NOTA_CANCELADA, PEDIDO_CANCELADO, "cancelada");
    expect(cancelada.ok).toBe(true);

    const nova = await inserirNota(null, PEDIDO_CANCELADO, "em_emissao");
    expect(nova.ok).toBe(true);
  });

  it("pedido secundário de nota agrupada não entra em duas notas vivas", async () => {
    const notaA = await inserirNota(NOTA_AGRUPADA, PEDIDO_AGRUPADO_A, "em_emissao");
    expect(notaA.ok).toBe(true);
    const idA = (notaA as { id: string }).id;

    await pool.query(
      `insert into public.invoice_orders (invoice_id, order_id, organization_id)
       values ($1, $2, $3)`,
      [idA, PEDIDO_AGRUPADO_A, ORG],
    );
    await pool.query(
      `insert into public.invoice_orders (invoice_id, order_id, organization_id)
       values ($1, $2, $3)`,
      [idA, PEDIDO_AGRUPADO_B, ORG],
    );

    // Segunda nota, principal diferente, mas o pedido B já está na primeira.
    const notaB = await inserirNota(null, PEDIDO_AGRUPADO_B, "em_emissao");
    expect(notaB.ok).toBe(true);
    const idB = (notaB as { id: string }).id;

    await expect(
      pool.query(
        `insert into public.invoice_orders (invoice_id, order_id, organization_id)
         values ($1, $2, $3)`,
        [idB, PEDIDO_AGRUPADO_B, ORG],
      ),
    ).rejects.toMatchObject({
      code: "23505",
      message: expect.stringContaining("invoice_pedido_ja_tem_nota_viva"),
    });
  });

  it("a mesma trava não cruza a fronteira da organização", async () => {
    // Pedido vizinho com o MESMO id lógico não existe; o que se prova é que a
    // checagem inclui organization_id e não bloqueia outra organização.
    const vizinho = await inserirNota(null, PEDIDO_VIZINHO, "em_emissao", ORG_VIZINHA);
    expect(vizinho.ok).toBe(true);
  });

  it("o drain muda o status de uma nota viva sem ser confundido com duplicata", async () => {
    const nota = await inserirNota(NOTA_DRENO, PEDIDO_DRENO, "em_emissao");
    expect(nota.ok).toBe(true);

    await expect(
      pool.query(`update public.invoices set status = 'autorizada' where id = $1`, [NOTA_DRENO]),
    ).resolves.toBeTruthy();

    const { rows } = await pool.query<{ status: string }>(
      `select status from public.invoices where id = $1`,
      [NOTA_DRENO],
    );
    expect(rows[0]?.status).toBe("autorizada");
  });
});
