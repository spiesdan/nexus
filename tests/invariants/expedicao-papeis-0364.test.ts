import { beforeAll, describe, expect, it } from "vitest";

import {
  GOV_AGENT_A,
  GOV_MANAGER,
  GOV_ORG,
  GOV_VIEWER,
  seedGov,
  sql,
  writeCountAs,
} from "./gov-helpers";

/**
 * 0364 — O PAPEL QUE A ROTA JÁ EXIGE PASSA A EXISTIR NA POLICY.
 *
 * Duas portas ficavam mais frouxas que a rota:
 *   - frota (`fleet_vehicles`/`fleet_drivers`): INSERT/UPDATE/DELETE para
 *     QUALQUER membro, enquanto a rota exige `manager`;
 *   - RPCs SECURITY DEFINER (`fn_salvar_ordem_rota`, `fn_remover_pedido_da_carga`):
 *     só membership, enquanto a rota exige `agent`.
 *
 * A rota HTTP não é a única porta: com a anon key + o JWT do próprio usuário,
 * o PostgREST atende `/rest/v1/fleet_vehicles` e `/rest/v1/rpc/...` direto.
 * Por isso a prova é no banco, com `set role authenticated` + claims — o mesmo
 * caminho da produção. Conectar como `postgres` mediria nada (bypassa RLS).
 */

const ORG_B = "eeeeeeee-0000-4000-8000-00000000000b";
const AGENT_B = "eeeeeeee-1111-4000-8000-00000000000b";

const V_VIEWER = "eeeeeeee-2222-4000-8000-000000000001";
const V_MANAGER = "eeeeeeee-2222-4000-8000-000000000002";
const V_ORG_B = "eeeeeeee-2222-4000-8000-000000000003";
const D_VIEWER = "eeeeeeee-2222-4000-8000-000000000004";
const D_MANAGER = "eeeeeeee-2222-4000-8000-000000000005";

const S_SALVAR_V = "eeeeeeee-3333-4000-8000-000000000001";
const S_SALVAR_A = "eeeeeeee-3333-4000-8000-000000000002";
const S_SALVAR_M = "eeeeeeee-3333-4000-8000-000000000003";
const S_SALVAR_B = "eeeeeeee-3333-4000-8000-000000000004";
const S_REMOVER_V = "eeeeeeee-3333-4000-8000-000000000005";
const S_REMOVER_A = "eeeeeeee-3333-4000-8000-000000000006";
const S_REMOVER_M = "eeeeeeee-3333-4000-8000-000000000007";

// shipment_orders (id) e o pedido comercial de cada uma.
const SO = {
  salvarV1: "eeeeeeee-4444-4000-8000-000000000001",
  salvarV2: "eeeeeeee-4444-4000-8000-000000000002",
  salvarA1: "eeeeeeee-4444-4000-8000-000000000003",
  salvarA2: "eeeeeeee-4444-4000-8000-000000000004",
  salvarM1: "eeeeeeee-4444-4000-8000-000000000005",
  salvarM2: "eeeeeeee-4444-4000-8000-000000000006",
  salvarB1: "eeeeeeee-4444-4000-8000-000000000007",
  salvarB2: "eeeeeeee-4444-4000-8000-000000000008",
  removerV: "eeeeeeee-4444-4000-8000-000000000009",
  removerA: "eeeeeeee-4444-4000-8000-000000000010",
  removerM: "eeeeeeee-4444-4000-8000-000000000011",
} as const;

const PED = {
  salvarV1: "eeeeeeee-5555-4000-8000-000000000001",
  salvarV2: "eeeeeeee-5555-4000-8000-000000000002",
  salvarA1: "eeeeeeee-5555-4000-8000-000000000003",
  salvarA2: "eeeeeeee-5555-4000-8000-000000000004",
  salvarM1: "eeeeeeee-5555-4000-8000-000000000005",
  salvarM2: "eeeeeeee-5555-4000-8000-000000000006",
  salvarB1: "eeeeeeee-5555-4000-8000-000000000007",
  salvarB2: "eeeeeeee-5555-4000-8000-000000000008",
  removerV: "eeeeeeee-5555-4000-8000-000000000009",
  removerA: "eeeeeeee-5555-4000-8000-000000000010",
  removerM: "eeeeeeee-5555-4000-8000-000000000011",
} as const;

function pedidoSql(id: string, shipmentOrderId: string, numero: number, shipmentId: string, sequencia: number) {
  return `
    insert into public.commercial_orders
      (id, organization_id, numero, cliente_nome, status, origem, subtotal_cents, frete_cents, total_cents)
    values ('${id}', '${GOV_ORG}', ${numero}, 'Cliente 0364', 'aprovado', 'vendedor', 100, 0, 100)
    on conflict (id) do nothing;
    insert into public.shipment_orders
      (id, organization_id, shipment_id, order_id, sequencia, status)
    values ('${shipmentOrderId}', '${GOV_ORG}', '${shipmentId}', '${id}', ${sequencia}, 'na_carga')
    on conflict (id) do nothing;`;
}

function versao(shipmentId: string): string {
  return sql(`select rota_versao from public.shipments where id = '${shipmentId}'`);
}

function chamarSalvar(userId: string, shipmentId: string, esperada: number, itens: { id: string; sequencia: number }[]): string {
  const out = sql(`
    set role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${userId}"}', false);
    select public.fn_salvar_ordem_rota(
      '${GOV_ORG}', '${shipmentId}',
      '${JSON.stringify(itens)}'::jsonb,
      '{}'::jsonb,
      ${esperada},
      now()
    )->>'rota_versao';
  `);
  return out.split("\n").pop() ?? "";
}

function chamarRemover(userId: string, shipmentId: string, orderId: string): string {
  const out = sql(`
    set role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${userId}"}', false);
    select public.fn_remover_pedido_da_carga('${GOV_ORG}', '${shipmentId}', '${orderId}')->>'status';
  `);
  return out.split("\n").pop() ?? "";
}

beforeAll(() => {
  seedGov();

  sql(`
    insert into auth.users (id, email) values ('${AGENT_B}', 'expedicao-0364-b@invariant.test')
      on conflict (id) do nothing;
    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${ORG_B}', 'expedicao-0364-b', 'Expedicao 0364 B', 'Expedicao B')
      on conflict (id) do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at)
      values ('${AGENT_B}', '${ORG_B}', 'agent', now())
      on conflict do nothing;

    -- Frota: linhas semeadas como superusuário para os testes de UPDATE/DELETE.
    insert into public.fleet_vehicles (id, organization_id, placa)
      values ('${V_VIEWER}', '${GOV_ORG}', 'TST1A23'),
             ('${V_MANAGER}', '${GOV_ORG}', 'TST2B34'),
             ('${V_ORG_B}', '${ORG_B}', 'TST3C45')
      on conflict (id) do nothing;
    insert into public.fleet_drivers (id, organization_id, nome)
      values ('${D_VIEWER}', '${GOV_ORG}', 'Motorista Viewer'),
             ('${D_MANAGER}', '${GOV_ORG}', 'Motorista Manager')
      on conflict (id) do nothing;

    insert into public.shipments (id, organization_id, numero, status, rota_versao)
      values ('${S_SALVAR_V}', '${GOV_ORG}', 9401, 'montando', 0),
             ('${S_SALVAR_A}', '${GOV_ORG}', 9402, 'montando', 0),
             ('${S_SALVAR_M}', '${GOV_ORG}', 9403, 'montando', 0),
             ('${S_SALVAR_B}', '${GOV_ORG}', 9404, 'montando', 0),
             ('${S_REMOVER_V}', '${GOV_ORG}', 9405, 'montando', 0),
             ('${S_REMOVER_A}', '${GOV_ORG}', 9406, 'montando', 0),
             ('${S_REMOVER_M}', '${GOV_ORG}', 9407, 'montando', 0)
      on conflict (id) do nothing;

    ${pedidoSql(PED.salvarV1, SO.salvarV1, 9411, S_SALVAR_V, 1)}
    ${pedidoSql(PED.salvarV2, SO.salvarV2, 9412, S_SALVAR_V, 2)}
    ${pedidoSql(PED.salvarA1, SO.salvarA1, 9413, S_SALVAR_A, 1)}
    ${pedidoSql(PED.salvarA2, SO.salvarA2, 9414, S_SALVAR_A, 2)}
    ${pedidoSql(PED.salvarM1, SO.salvarM1, 9415, S_SALVAR_M, 1)}
    ${pedidoSql(PED.salvarM2, SO.salvarM2, 9416, S_SALVAR_M, 2)}
    ${pedidoSql(PED.salvarB1, SO.salvarB1, 9417, S_SALVAR_B, 1)}
    ${pedidoSql(PED.salvarB2, SO.salvarB2, 9418, S_SALVAR_B, 2)}
    ${pedidoSql(PED.removerV, SO.removerV, 9419, S_REMOVER_V, 1)}
    ${pedidoSql(PED.removerA, SO.removerA, 9420, S_REMOVER_A, 1)}
    ${pedidoSql(PED.removerM, SO.removerM, 9421, S_REMOVER_M, 1)}
  `);
});

describe("0364 — frota: escrita só manager+", () => {
  it("viewer NÃO cria veículo", () => {
    const n = writeCountAs(
      GOV_VIEWER,
      `insert into public.fleet_vehicles (organization_id, placa)
         values ('${GOV_ORG}', 'TST9Z99')`,
    );
    expect(n).toBe(0);
  });

  it("viewer NÃO edita nem apaga veículo existente", () => {
    const editou = writeCountAs(
      GOV_VIEWER,
      `update public.fleet_vehicles set veiculo_tipo = 'forjado'
        where id = '${V_VIEWER}'`,
    );
    const apagou = writeCountAs(
      GOV_VIEWER,
      `delete from public.fleet_vehicles where id = '${V_VIEWER}'`,
    );
    expect(editou).toBe(0);
    expect(apagou).toBe(0);
    expect(sql(`select veiculo_tipo is null from public.fleet_vehicles where id = '${V_VIEWER}'`)).toBe("t");
  });

  it("viewer NÃO cria, edita nem apaga motorista", () => {
    const criou = writeCountAs(
      GOV_VIEWER,
      `insert into public.fleet_drivers (organization_id, nome)
         values ('${GOV_ORG}', 'Motorista Forjado')`,
    );
    const editou = writeCountAs(
      GOV_VIEWER,
      `update public.fleet_drivers set telefone = '000' where id = '${D_VIEWER}'`,
    );
    const apagou = writeCountAs(
      GOV_VIEWER,
      `delete from public.fleet_drivers where id = '${D_VIEWER}'`,
    );
    expect(criou).toBe(0);
    expect(editou).toBe(0);
    expect(apagou).toBe(0);
    expect(sql(`select telefone is null from public.fleet_drivers where id = '${D_VIEWER}'`)).toBe("t");
  });

  it("manager cria, edita e apaga veículo e motorista (controle positivo)", () => {
    const criouV = writeCountAs(
      GOV_MANAGER,
      `insert into public.fleet_vehicles (organization_id, placa)
         values ('${GOV_ORG}', 'TST9Z99')`,
    );
    const editouV = writeCountAs(
      GOV_MANAGER,
      `update public.fleet_vehicles set veiculo_tipo = 'van' where id = '${V_MANAGER}'`,
    );
    const apagouV = writeCountAs(
      GOV_MANAGER,
      `delete from public.fleet_vehicles where placa = 'TST9Z99'`,
    );
    const criouD = writeCountAs(
      GOV_MANAGER,
      `insert into public.fleet_drivers (organization_id, nome)
         values ('${GOV_ORG}', 'Motorista Novo')`,
    );
    const editouD = writeCountAs(
      GOV_MANAGER,
      `update public.fleet_drivers set telefone = '44999999999' where id = '${D_MANAGER}'`,
    );
    const apagouD = writeCountAs(
      GOV_MANAGER,
      `delete from public.fleet_drivers where nome = 'Motorista Novo'`,
    );
    expect([criouV, editouV, apagouV, criouD, editouD, apagouD]).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it("agente de outra organização não escreve a frota alheia", () => {
    const n = writeCountAs(
      AGENT_B,
      `insert into public.fleet_vehicles (organization_id, placa)
         values ('${GOV_ORG}', 'TST8Y88')`,
    );
    expect(n).toBe(0);
  });

  it("anon não tem privilégio de tabela em nenhum comando da frota", () => {
    for (const tabela of ["fleet_vehicles", "fleet_drivers"]) {
      for (const cmd of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        expect(
          sql(`select has_table_privilege('anon', 'public.${tabela}', '${cmd}')::text`),
        ).toBe("false");
      }
    }
  });
});

describe("0364 — RPCs definer: guarda agent+", () => {
  const itensV = [
    { id: SO.salvarV1, sequencia: 1 },
    { id: SO.salvarV2, sequencia: 2 },
  ];
  const itensA = [
    { id: SO.salvarA1, sequencia: 1 },
    { id: SO.salvarA2, sequencia: 2 },
  ];
  const itensM = [
    { id: SO.salvarM1, sequencia: 1 },
    { id: SO.salvarM2, sequencia: 2 },
  ];
  const itensB = [
    { id: SO.salvarB1, sequencia: 1 },
    { id: SO.salvarB2, sequencia: 2 },
  ];

  it("viewer NÃO salva a ordem da rota — e a versão não sobe", () => {
    expect(() => chamarSalvar(GOV_VIEWER, S_SALVAR_V, 0, itensV)).toThrow();
    expect(versao(S_SALVAR_V)).toBe("0");
  });

  it("agent salva a ordem da rota", () => {
    expect(chamarSalvar(GOV_AGENT_A, S_SALVAR_A, 0, itensA)).toBe("1");
    expect(versao(S_SALVAR_A)).toBe("1");
  });

  it("manager também salva (papel acima de agent)", () => {
    expect(chamarSalvar(GOV_MANAGER, S_SALVAR_M, 0, itensM)).toBe("1");
  });

  it("agent de outra organização NÃO salva a ordem da org alheia", () => {
    expect(() => chamarSalvar(AGENT_B, S_SALVAR_B, 0, itensB)).toThrow();
    expect(versao(S_SALVAR_B)).toBe("0");
  });

  it("viewer NÃO remove pedido da carga — a linha continua", () => {
    expect(() => chamarRemover(GOV_VIEWER, S_REMOVER_V, PED.removerV)).toThrow();
    expect(
      sql(`select count(*) from public.shipment_orders where shipment_id = '${S_REMOVER_V}'`),
    ).toBe("1");
  });

  it("agent remove pedido da carga", () => {
    expect(chamarRemover(GOV_AGENT_A, S_REMOVER_A, PED.removerA)).toBe("removido");
    expect(
      sql(`select count(*) from public.shipment_orders where shipment_id = '${S_REMOVER_A}'`),
    ).toBe("0");
  });

  it("manager também remove (papel acima de agent)", () => {
    expect(chamarRemover(GOV_MANAGER, S_REMOVER_M, PED.removerM)).toBe("removido");
  });
});
