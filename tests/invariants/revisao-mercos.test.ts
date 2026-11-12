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
 *   6. segunda revisão igual devolve `sem_mudanca` e não suja `updated_at`;
 *   7. a UF que o ERP NÃO manda não é mudança (0304): o worker extrai a linha
 *      "<cidade>, <estado>" e manda tudo dentro de `cidade`, sem `uf`. Comparar
 *      a UF do cadastro com NULL marcava "Mudou no Mercos" em todo pedido — 17
 *      das 19 paradas da carga 40 em 12/11/2026, nenhum item alterado.
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
// 0304 — o worker manda "Cidade, Estado" sem `uf`.
const CONTATO_UF = "0297aaaa-1111-4000-8000-000000000003";
const PEDIDO_UF = "0297aaaa-2222-4000-8000-000000000006";
const CONTATO_ESTADO = "0297aaaa-1111-4000-8000-000000000004";
const PEDIDO_ESTADO = "0297aaaa-2222-4000-8000-000000000007";
const CONTATO_CIDADE = "0297aaaa-1111-4000-8000-000000000005";
const PEDIDO_CIDADE = "0297aaaa-2222-4000-8000-000000000008";

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

    -- 0304: cadastro limpo com UF, cadastro sujo com o nome do estado dentro
    -- da cidade, e cadastro de uma cidade DIFERENTE (para provar que mudança
    -- real continua avisando).
    insert into public.contacts (id, organization_id, name, display_name, cidade, uf)
    values
      ('${CONTATO_UF}', '${ORG}', 'CLIENTE COM UF', 'CLIENTE COM UF', 'Bituruna', 'PR'),
      ('${CONTATO_ESTADO}', '${ORG}', 'CLIENTE COM ESTADO', 'CLIENTE COM ESTADO', 'Bituruna, Paraná', 'PR'),
      ('${CONTATO_CIDADE}', '${ORG}', 'CLIENTE DE CIDADE', 'CLIENTE DE CIDADE', 'Bituruna', 'PR')
    on conflict (id) do nothing;

    insert into public.commercial_orders
      (id, organization_id, numero, contact_id, cliente_nome, status, origem,
       subtotal_cents, frete_cents, total_cents)
    values
      ('${PEDIDO_UF}', '${ORG}', 9006, '${CONTATO_UF}', 'CLIENTE COM UF', 'aprovado', 'mercos', 1000, 0, 1000),
      ('${PEDIDO_ESTADO}', '${ORG}', 9007, '${CONTATO_ESTADO}', 'CLIENTE COM ESTADO', 'aprovado', 'mercos', 1000, 0, 1000),
      ('${PEDIDO_CIDADE}', '${ORG}', 9008, '${CONTATO_CIDADE}', 'CLIENTE DE CIDADE', 'aprovado', 'mercos', 1000, 0, 1000)
    on conflict (id) do nothing;

    insert into public.commercial_order_items
      (organization_id, order_id, produto_codigo, produto_nome, quantidade,
       preco_unit_cents, desconto_pct, subtotal_cents, posicao)
    values ('${ORG}', '${PEDIDO_UF}', 'X', 'ITEM X', 1, 1000, 0, 1000, 1),
           ('${ORG}', '${PEDIDO_ESTADO}', 'X', 'ITEM X', 1, 1000, 0, 1000, 1),
           ('${ORG}', '${PEDIDO_CIDADE}', 'X', 'ITEM X', 1, 1000, 0, 1000, 1)
    on conflict do nothing;

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

/**
 * 0304 · A UF QUE O MERCOS NÃO MANDA NÃO É MUDANÇA.
 *
 * O caso medido em 12/11/2026: 17 das 19 paradas da carga 40 com "Mudou no
 * Mercos", e nenhuma delas com item, quantidade ou preço alterado. Todas
 * registravam a mesma mudança falsa — `cidade` de "GENERAL CARNEIRO,
 * Paraná/PR" para "GENERAL CARNEIRO, Paraná" — porque o worker manda
 * "<cidade>, <estado>" dentro de `cidade` e NUNCA manda `uf`; a revisão
 * comparava a UF do cadastro com NULL.
 *
 * O que aqui se prende:
 *
 *   1. payload sem `uf` + cadastro com UF = `sem_mudanca` (e a UF fica);
 *   2. cadastro sujo ("Bituruna, Paraná") + payload "Bituruna, Paraná" =
 *      `sem_mudanca`, e o cadastro é limpo para "Bituruna" + PR;
 *   3. cidade de verdade diferente CONTINUA avisando.
 */

/** O payload mínimo que a tela do ERP entrega: cidade crua, sem `uf`. */
function payloadSimples(numero: number, clienteNome: string, cidade: string): Payload {
  return {
    numero,
    cliente_nome: clienteNome,
    cliente_documento: null,
    cliente: { cidade },
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
  };
}

describe("0304 · a UF que o Mercos não manda não é mudança", () => {
  it("payload sem `uf` não inventa mudança — a UF do cadastro permanece", () => {
    const r = sincronizar(payloadSimples(9006, "CLIENTE COM UF", "Bituruna"), true);
    expect(r.status).toBe("sem_mudanca");
    expect(r.mudancas).toEqual([]);
    expect(
      sql(`select cidade || '|' || coalesce(uf, '') from public.contacts where id = '${CONTATO_UF}'`),
    ).toBe("Bituruna|PR");
    expect(
      sql(`select coalesce(mercos_ultima_mudanca::text, 'null')
             from public.commercial_orders where id = '${PEDIDO_UF}'`),
    ).toBe("null");
  });

  it("cadastro com o estado colado na cidade é o mesmo endereço, não mudança", () => {
    const r = sincronizar(payloadSimples(9007, "CLIENTE COM ESTADO", "Bituruna, Paraná"), true);
    expect(r.status).toBe("sem_mudanca");
    expect(r.mudancas).toEqual([]);
    // A revisão limpa o que a importação antiga gravou — sem marcar a carga.
    expect(
      sql(`select cidade || '|' || coalesce(uf, '')
             from public.contacts where id = '${CONTATO_ESTADO}'`),
    ).toBe("Bituruna|PR");
  });

  it("cidade de verdade diferente continua avisando, com a UF separada", () => {
    const r = sincronizar(payloadSimples(9008, "CLIENTE DE CIDADE", "Canoinhas, Santa Catarina"), true);
    expect(r.status).toBe("atualizado");
    expect(r.mudancas).toEqual([
      { campo: "cidade", de: "Bituruna/PR", para: "Canoinhas/SC" },
    ]);
    expect(
      sql(`select cidade || '|' || coalesce(uf, '')
             from public.contacts where id = '${CONTATO_CIDADE}'`),
    ).toBe("Canoinhas|SC");
  });
});
