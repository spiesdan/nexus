import { execFileSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * 0298 · PAGO E ENTREGUE NO MERCOS SAI DA CARGA.
 *
 * O caso que abriu esta migration é operacional: o vendedor externo entrega a
 * mercadoria na mão, recebe o dinheiro e escreve "Pago e ja entregue" nas
 * **Informações Adicionais** do pedido no Mercos. O CRM importava o pedido como
 * `faturado` — elegível para a carga — e o motorista saía com uma mercadoria que
 * o cliente já tinha.
 *
 * O que este arquivo prende, e por quê:
 *
 *   1. a régua exige as DUAS ideias e tolera digitação (pg, entrgue, entrege);
 *   2. negação e futuro NÃO contam ("falta pagar", "pago e a entregar");
 *   3. a importação grava a observação no campo próprio e nasce `entregue`;
 *   4. a revisão fecha pedido antigo em `entregue`, inclusive com nota emitida,
 *      e marca a carga aberta para reconferir;
 *   5. nunca regride `entregue`/`cancelado`.
 *
 * Prova contra Postgres real porque a regra é do banco: é a função que decide o
 * que o ERP pode escrever, e um dublê aceitaria qualquer coisa.
 */

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error(
    "TEST_DB_CONTAINER not set — rode esta suíte via `pnpm test:db` (scripts/test-db.sh)",
  );
}
const containerName: string = container;

function sql(script: string): string {
  return execFileSync(
    "docker",
    [
      "exec", "-i", containerName, "psql", "-U", "postgres", "-d", "postgres",
      "-v", "ON_ERROR_STOP=1", "-tA", "-f", "-",
    ],
    { input: script, encoding: "utf8" },
  ).trim();
}

const ORG = "0298aaaa-0000-4000-8000-000000000001";
const PEDIDO_NOVO = 9101;
const PEDIDO_ABERTO = 9102;
const PEDIDO_ANTIGO = "0298aaaa-2222-4000-8000-000000000001";
const PEDIDO_COM_NOTA = "0298aaaa-2222-4000-8000-000000000002";
const PEDIDO_ENTREGUE = "0298aaaa-2222-4000-8000-000000000003";
const CARGA = "0298aaaa-3333-4000-8000-000000000001";

interface Payload {
  numero: number;
  status: string;
  cliente_nome: string;
  cliente_documento?: string | null;
  cliente?: { razao?: string | null; documento?: string | null; telefone?: string | null; cidade?: string | null };
  subtotal_cents?: number;
  frete_cents?: number;
  total_cents: number;
  created_at?: string;
  mercos_observacoes?: string | null;
  itens: {
    codigo: string;
    descricao: string;
    quantidade: number;
    preco_unit_cents: number;
    subtotal_cents: number;
  }[];
}

function payloadDoMercos(over: Partial<Payload> = {}): Payload {
  return {
    numero: PEDIDO_ABERTO,
    status: "faturado",
    cliente_nome: "CLIENTE QUE PAGOU NA HORA",
    cliente_documento: "45.678.912/0001-77",
    cliente: {
      razao: "CLIENTE QUE PAGOU NA HORA",
      documento: "45.678.912/0001-77",
      telefone: null,
      cidade: "Mafra, SC",
    },
    subtotal_cents: 1_000,
    frete_cents: 0,
    total_cents: 1_000,
    created_at: "2026-11-06T15:00:00.000Z",
    itens: [
      {
        codigo: "PAGO1",
        descricao: "ITEM PAGO NA HORA",
        quantidade: 1,
        preco_unit_cents: 1_000,
        subtotal_cents: 1_000,
      },
    ],
    ...over,
  };
}

function casar(texto: string | null): boolean {
  const literal = texto === null ? "null" : `$t$${texto}$t$`;
  return sql(`select public.fn_mercos_pago_e_entregue(${literal});`) === "t";
}

function sincronizar(p: Payload, aplicar = true): Record<string, unknown> {
  return JSON.parse(
    sql(`
      select public.fn_sincronizar_pedido_mercos(
        '${ORG}',
        $json$${JSON.stringify(p)}$json$::jsonb,
        ${aplicar ? "true" : "false"}
      );
    `),
  ) as Record<string, unknown>;
}

beforeAll(() => {
  sql(`
    insert into public.organizations (id, slug, legal_name, display_name)
    values ('${ORG}', 'mercos-pago-entregue', 'Mercos pago e entregue', 'Mercos pago e entregue')
    on conflict (id) do nothing;

    insert into public.commercial_orders
      (id, organization_id, numero, cliente_nome, status, origem,
       subtotal_cents, frete_cents, total_cents)
    values
      ('${PEDIDO_ANTIGO}', '${ORG}', 9103, 'CLIENTE ANTIGO', 'faturado', 'mercos', 500, 0, 500),
      ('${PEDIDO_COM_NOTA}', '${ORG}', 9104, 'COM NOTA', 'faturado', 'mercos', 500, 0, 500),
      ('${PEDIDO_ENTREGUE}', '${ORG}', 9105, 'JA ENTREGUE', 'entregue', 'mercos', 500, 0, 500)
    on conflict (id) do nothing;

    insert into public.invoices (id, organization_id, order_id, serie, total_cents, status)
    values ('0298aaaa-4444-4000-8000-000000000001', '${ORG}', '${PEDIDO_COM_NOTA}', '1', 500, 'autorizada')
    on conflict (id) do nothing;

    insert into public.shipments (id, organization_id, numero, status)
    values ('${CARGA}', '${ORG}', 298, 'montando')
    on conflict (id) do nothing;
  `);
});

describe("0298 · a régua do 'pago e entregue'", () => {
  it.each([
    ["Pago e ja entregue", true],
    ["PAGO E JÁ ENTREGUE", true],
    ["pago e entrgue", true],
    ["pg e entregue", true],
    ["pago e entrege", true],
    ["pago e entregou", true],
    ["Pago, entreguei na hora", true],
    ["cliente pagou e entregamos", true],
    ["Pago e já entregue — retirado na loja", true],
  ])("%s → %s", (texto, esperado) => {
    expect(casar(texto)).toBe(esperado);
  });

  it.each([
    ["falta pagar", false],
    ["pago e a entregar", false],
    ["pago, entregar dia 10", false],
    ["pago e nao entregue", false],
    ["pago e nao foi entregue", false],
    ["nao pago", false],
    ["entregue", false],
    ["pago", false],
    ["", false],
    [null, false],
  ])("%s → %s", (texto, esperado) => {
    expect(casar(texto as string | null)).toBe(esperado);
  });
});

describe("0298 · importação", () => {
  it("pedido com 'Pago e ja entregue' nasce entregue e guarda a observação", () => {
    const r = JSON.parse(
      sql(`
        select public.fn_importar_pedido_mercos('${ORG}', $json$${JSON.stringify(
          payloadDoMercos({ numero: PEDIDO_NOVO, mercos_observacoes: "Pago e ja entregue" }),
        )}$json$::jsonb);
      `),
    ) as { status: string; order_id: string };

    expect(r.status).toBe("inserted");
    expect(
      sql(`select status || '|' || mercos_observacoes from public.commercial_orders where id = '${r.order_id}'`),
    ).toBe("entregue|Pago e ja entregue");
  });

  it("pedido sem a observação continua faturado (elegível para a carga)", () => {
    const p = payloadDoMercos({
      numero: 9106,
      cliente_nome: "CLIENTE EM ABERTO",
      cliente_documento: "45.678.913/0001-77",
      cliente: { razao: "CLIENTE EM ABERTO", documento: "45.678.913/0001-77" },
    });
    const r = JSON.parse(
      sql(`select public.fn_importar_pedido_mercos('${ORG}', $json$${JSON.stringify(p)}$json$::jsonb);`),
    ) as { status: string; order_id: string };

    expect(r.status).toBe("inserted");
    expect(
      sql(`select status || '|' || coalesce(mercos_observacoes, '') from public.commercial_orders where id = '${r.order_id}'`),
    ).toBe("faturado|");
  });
});

describe("0298 · revisão do pedido antigo", () => {
  it("conferir (sem aplicar) mostra que viraria entregue e não grava", () => {
    const r = sincronizar(payloadDoMercos({ numero: 9103, mercos_observacoes: "Pago e ja entregue" }), false);
    expect(r.status).toBe("conferir");
    expect(
      sql(`select status from public.commercial_orders where id = '${PEDIDO_ANTIGO}'`),
    ).toBe("faturado");
  });

  it("aplica: fecha em entregue, guarda a observação e marca a carga aberta", () => {
    sql(`
      insert into public.shipment_orders (organization_id, shipment_id, order_id, sequencia, status)
      values ('${ORG}', '${CARGA}', '${PEDIDO_ANTIGO}', 1, 'na_carga')
      on conflict do nothing;
    `);

    const r = sincronizar(payloadDoMercos({ numero: 9103, mercos_observacoes: "Pago e ja entregue" }));
    expect(r.status).toBe("atualizado");
    expect(r.mudancas).toEqual(
      expect.arrayContaining([expect.objectContaining({ campo: "status", para: "entregue" })]),
    );
    expect(r.carga).toMatchObject({ reconferir: true });

    expect(
      sql(`select status || '|' || mercos_observacoes from public.commercial_orders where id = '${PEDIDO_ANTIGO}'`),
    ).toBe("entregue|Pago e ja entregue");

    expect(
      sql(`select (reconferir_em is not null) || '|' || coalesce(reconferir_motivo, '')
           from public.shipment_orders where order_id = '${PEDIDO_ANTIGO}'`),
    ).toBe("true|Pedido 9103 está pago e entregue no Mercos — foi entregue fora da carga.");
  });

  it("nota emitida não impede o registro da entrega física", () => {
    const r = sincronizar(payloadDoMercos({ numero: 9104, mercos_observacoes: "pago e entregue" }));
    expect(r.status).toBe("atualizado");
    expect(
      sql(`select status from public.commercial_orders where id = '${PEDIDO_COM_NOTA}'`),
    ).toBe("entregue");
  });

  it("nunca regride pedido já entregue", () => {
    const r = sincronizar(payloadDoMercos({ numero: 9105, mercos_observacoes: "Pago e ja entregue" }));
    expect(r.status).toBe("bloqueado");
    expect(r.motivo).toBe("pedido_encerrado");
    expect(
      sql(`select status from public.commercial_orders where id = '${PEDIDO_ENTREGUE}'`),
    ).toBe("entregue");
  });

  it("'falta pagar' não fecha pedido nenhum", () => {
    const r = sincronizar(
      payloadDoMercos({
        numero: 9106,
        cliente_nome: "CLIENTE EM ABERTO",
        cliente_documento: "45.678.913/0001-77",
        cliente: { razao: "CLIENTE EM ABERTO", documento: "45.678.913/0001-77", cidade: "Mafra, SC" },
        mercos_observacoes: "falta pagar",
      }),
    );
    expect(r.status).toBe("atualizado");
    expect(
      sql(`select status || '|' || mercos_observacoes from public.commercial_orders where numero = 9106`),
    ).toBe("faturado|falta pagar");
  });
});
