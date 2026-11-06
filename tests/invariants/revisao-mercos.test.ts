import { execFileSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * 0297 · O PEDIDO QUE MUDOU NO MERCOS.
 *
 * O caso que abriu esta migration foi operacional: um vendedor externo alterou
 * um pedido no Mercos, o pedido já tinha sido importado com o dado velho, e a
 * expedição saiu com cliente/cidade/itens antigos. A revisão automática (janela
 * recente) e o botão "Atualizar do Mercos" da ficha dependem daqui.
 *
 * O que este arquivo prende, e por quê:
 *
 *   1. o diff sem escrita (`p_aplicar = false`) devolve `conferir`, não grava;
 *   2. aplicar muda cliente, endereço (cidade/UF do contato, separando o
 *      "Cidade, UF" cru que a importação antiga gravou) e itens/totais;
 *   3. nota emitida bloqueia (`nota_emitida`) — o documento fiscal congela os
 *      itens; pedido entregue/cancelado bloqueia (`pedido_encerrado`);
 *   4. pedido LOCAL com o mesmo número nunca é tocado (`nao_encontrado`), que é
 *      o caso dos 18538..18558 de demonstração;
 *   5. pedido em carga é atualizado e a CARGA é marcada para reconferir — sem
 *      sair da carga sozinho;
 *   6. segunda revisão igual devolve `sem_mudanca` e não suja `updated_at`.
 *
 * Prova contra Postgres real porque a regra é do banco: é a função que decide
 * o que o ERP pode reescrever, e um dublê aceitaria qualquer coisa.
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

const ORG = "0297aaaa-0000-4000-8000-000000000001";
const CONTATO = "0297aaaa-1111-4000-8000-000000000001";
const PEDIDO = "0297aaaa-2222-4000-8000-000000000001";
const PEDIDO_LOCAL = "0297aaaa-2222-4000-8000-000000000002";
const PEDIDO_COM_NOTA = "0297aaaa-2222-4000-8000-000000000003";
const PEDIDO_ENTREGUE = "0297aaaa-2222-4000-8000-000000000004";
const PEDIDO_SUJO = "0297aaaa-2222-4000-8000-000000000005";
const CONTATO_SUJO = "0297aaaa-1111-4000-8000-000000000002";
const CARGA = "0297aaaa-3333-4000-8000-000000000001";

interface Payload {
  numero: number;
  cliente_nome: string;
  cliente_documento?: string | null;
  cliente?: { cidade?: string | null; uf?: string | null };
  condicao_pagamento?: string | null;
  subtotal_cents?: number;
  frete_cents?: number;
  total_cents: number;
  itens: {
    codigo: string;
    descricao: string;
    quantidade: number;
    preco_unit_cents: number;
    subtotal_cents: number;
  }[];
}

/** O payload que o worker normaliza, com a cidade CRUA do scraping. */
function payloadDoMercos(over: Partial<Payload> = {}): Payload {
  return {
    numero: 9001,
    cliente_nome: "CLIENTE NOVO",
    cliente_documento: "12.345.678/0001-90",
    cliente: { cidade: "Canoinhas, SC" },
    condicao_pagamento: "30/60",
    subtotal_cents: 20_000,
    frete_cents: 1_500,
    total_cents: 20_000,
    itens: [
      {
        codigo: "A",
        descricao: "ITEM A",
        quantidade: 1,
        preco_unit_cents: 10_000,
        subtotal_cents: 10_000,
      },
      {
        codigo: "B",
        descricao: "ITEM B",
        quantidade: 2,
        preco_unit_cents: 5_000,
        subtotal_cents: 10_000,
      },
    ],
    ...over,
  };
}

interface Resultado {
  status: string;
  numero: number;
  order_id?: string;
  motivo?: string;
  mudancas?: { campo: string; de: unknown; para: unknown }[];
  carga?: { reconferir: boolean } | null;
}

function sincronizar(p: Payload, aplicar = false): Resultado {
  const bruto = sql(`
    select public.fn_sincronizar_pedido_mercos(
      '${ORG}',
      $json$${JSON.stringify(p)}$json$::jsonb,
      ${aplicar ? "true" : "false"}
    );
  `);
  return JSON.parse(bruto) as Resultado;
}

beforeAll(() => {
  sql(`
    insert into public.organizations (id, slug, legal_name, display_name)
    values ('${ORG}', 'revisao-mercos', 'Revisão Mercos', 'Revisão Mercos')
    on conflict (id) do nothing;

    insert into public.contacts (id, organization_id, name, display_name, cidade, uf)
    values ('${CONTATO}', '${ORG}', 'CLIENTE ANTIGO', 'CLIENTE ANTIGO', 'Joinville', 'SC')
    on conflict (id) do nothing;

    -- Cadastro legado: a importação antiga gravava a linha "Cidade, UF" crua em
    -- contacts.cidade, com uf nulo. É sujeira, não mudança.
    insert into public.contacts (id, organization_id, name, display_name, cidade, uf)
    values ('${CONTATO_SUJO}', '${ORG}', 'CLIENTE SUJO', 'CLIENTE SUJO', 'Canoinhas, SC', null)
    on conflict (id) do nothing;

    insert into public.commercial_orders
      (id, organization_id, numero, contact_id, cliente_nome, status, origem,
       subtotal_cents, frete_cents, total_cents)
    values
      ('${PEDIDO}', '${ORG}', 9001, '${CONTATO}', 'CLIENTE ANTIGO', 'aprovado', 'mercos', 10000, 0, 10000),
      ('${PEDIDO_LOCAL}', '${ORG}', 9002, null, 'PEDIDO LOCAL', 'aprovado', 'vendedor', 500, 0, 500),
      ('${PEDIDO_COM_NOTA}', '${ORG}', 9003, null, 'COM NOTA', 'faturado', 'mercos', 500, 0, 500),
      ('${PEDIDO_ENTREGUE}', '${ORG}', 9004, null, 'ENTREGUE', 'entregue', 'mercos', 500, 0, 500),
      ('${PEDIDO_SUJO}', '${ORG}', 9005, '${CONTATO_SUJO}', 'CLIENTE SUJO', 'aprovado', 'mercos', 1000, 0, 1000)
    on conflict (id) do nothing;

    insert into public.commercial_order_items
      (organization_id, order_id, produto_codigo, produto_nome, quantidade,
       preco_unit_cents, desconto_pct, subtotal_cents, posicao)
    values ('${ORG}', '${PEDIDO}', 'ANTIGO', 'ITEM ANTIGO', 1, 10000, 0, 10000, 1),
           ('${ORG}', '${PEDIDO_SUJO}', 'X', 'ITEM X', 1, 1000, 0, 1000, 1)
    on conflict do nothing;

    insert into public.invoices (id, organization_id, order_id, serie, total_cents, status)
    values ('0297aaaa-4444-4000-8000-000000000001', '${ORG}', '${PEDIDO_COM_NOTA}', '1', 500, 'autorizada')
    on conflict (id) do nothing;

    insert into public.shipments (id, organization_id, numero, status)
    values ('${CARGA}', '${ORG}', 297, 'montando')
    on conflict (id) do nothing;
  `);
});

describe("0297 · revisão do pedido importado do Mercos", () => {
  it("diff sem escrita devolve o que mudaria e não grava nada", () => {
    const r = sincronizar(payloadDoMercos(), false);
    expect(r.status).toBe("conferir");
    expect(r.mudancas?.map((m) => m.campo)).toEqual(
      expect.arrayContaining(["cliente_nome", "cidade", "itens", "total_cents"]),
    );

    expect(sql(`select cliente_nome from public.commercial_orders where id = '${PEDIDO}'`)).toBe(
      "CLIENTE ANTIGO",
    );
    expect(sql(`select cidade from public.contacts where id = '${CONTATO}'`)).toBe("Joinville");
  });

  it("aplicar atualiza cliente, endereço (separando cidade/UF) e itens/totais", () => {
    const r = sincronizar(payloadDoMercos(), true);
    expect(r.status).toBe("atualizado");
    expect(r.mudancas?.map((m) => m.campo)).toEqual(
      expect.arrayContaining(["cliente_nome", "cidade", "itens"]),
    );

    expect(
      sql(`select cliente_nome || '|' || coalesce(cliente_documento, '') || '|' ||
                  total_cents || '|' || frete_cents || '|' ||
                  (mercos_sincronizado_em is not null) || '|' ||
                  (mercos_ultima_mudanca is not null)
             from public.commercial_orders where id = '${PEDIDO}'`),
    ).toBe("CLIENTE NOVO|12.345.678/0001-90|20000|1500|true|true");

    // O cadastro é o que a expedição lê: cidade saiu do "Canoinhas, SC" cru
    // para cidade + UF separadas.
    expect(
      sql(`select cidade || '|' || coalesce(uf, '') from public.contacts where id = '${CONTATO}'`),
    ).toBe("Canoinhas|SC");

    expect(
      sql(`select count(*) || '|' || sum(quantidade) || '|' || sum(subtotal_cents)
             from public.commercial_order_items where order_id = '${PEDIDO}'`),
    ).toBe("2|3|20000");
  });

  it("revisar de novo sem diferença devolve sem_mudanca e não marca a carga", () => {
    const r = sincronizar(payloadDoMercos(), true);
    expect(r.status).toBe("sem_mudanca");
    expect(r.mudancas).toEqual([]);
  });

  it("nota emitida bloqueia — o documento fiscal congela os itens", () => {
    const r = sincronizar(payloadDoMercos({ numero: 9003 }), true);
    expect(r.status).toBe("bloqueado");
    expect(r.motivo).toBe("nota_emitida");
    expect(sql(`select cliente_nome from public.commercial_orders where id = '${PEDIDO_COM_NOTA}'`)).toBe(
      "COM NOTA",
    );
  });

  it("pedido entregue bloqueia — ciclo encerrado", () => {
    const r = sincronizar(payloadDoMercos({ numero: 9004 }), true);
    expect(r.status).toBe("bloqueado");
    expect(r.motivo).toBe("pedido_encerrado");
  });

  it("pedido LOCAL com o mesmo número nunca é reescrito pelo ERP", () => {
    const r = sincronizar(payloadDoMercos({ numero: 9002 }), true);
    expect(r.status).toBe("nao_encontrado");
    expect(
      sql(`select cliente_nome || '|' || origem from public.commercial_orders where id = '${PEDIDO_LOCAL}'`),
    ).toBe("PEDIDO LOCAL|vendedor");
  });

  it("pedido que já está numa carga é atualizado e a carga é marcada para reconferir", () => {
    sql(`
      insert into public.shipment_orders (organization_id, shipment_id, order_id, sequencia)
      values ('${ORG}', '${CARGA}', '${PEDIDO}', 1)
      on conflict do nothing;
    `);

    const r = sincronizar(
      payloadDoMercos({
        cliente_nome: "CLIENTE MUDOU DEPOIS DO EMBARQUE",
        total_cents: 20_000,
      }),
      true,
    );
    expect(r.status).toBe("atualizado");
    expect(r.carga).toMatchObject({ status: "montando", reconferir: true });

    expect(
      sql(`select (reconferir_em is not null) || '|' || coalesce(reconferir_motivo, '')
             from public.shipment_orders
            where shipment_id = '${CARGA}' and order_id = '${PEDIDO}'`),
    ).toContain("true|Pedido 9001 mudou no Mercos");

    // Continua NA carga: avisar não é desembarcar.
    expect(
      sql(`select count(*) from public.shipment_orders
            where shipment_id = '${CARGA}' and order_id = '${PEDIDO}'`),
    ).toBe("1");
  });

  it("limpa o cadastro legado (\"Cidade, UF\" cru) mesmo quando nada mudou", () => {
    const r = sincronizar(
      payloadDoMercos({
        numero: 9005,
        cliente_nome: "CLIENTE SUJO",
        cliente_documento: null,
        cliente: { cidade: "Canoinhas, SC" },
        condicao_pagamento: null,
        subtotal_cents: 1000,
        frete_cents: 0,
        total_cents: 1000,
        itens: [
          {
            codigo: "X",
            descricao: "ITEM X",
            quantidade: 1,
            preco_unit_cents: 1000,
            subtotal_cents: 1000,
          },
        ],
      }),
      true,
    );
    expect(r.status).toBe("sem_mudanca");
    expect(
      sql(`select cidade || '|' || coalesce(uf, '') from public.contacts where id = '${CONTATO_SUJO}'`),
    ).toBe("Canoinhas|SC");
  });

  it("soma dos itens diferente do total é divergência, não escrita", () => {
    const r = sincronizar(payloadDoMercos({ total_cents: 99_999 }), true);
    expect(r.status).toBe("divergente");
  });
});
