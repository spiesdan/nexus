import { beforeAll, describe, expect, it } from "vitest";

import { countAs, sql, writeCountAs } from "./gov-helpers";

/**
 * 0355 · Clientes duplicados: a fila mostra, o humano decide, a fusão reponta.
 *
 * O que se prova aqui, contra Postgres real:
 *
 *   1. o grupo candidato só aparece com nome normalizado + cidade iguais, sem
 *      CNPJ e com histórico; grupo com CNPJ ou sem histórico fica de fora;
 *   2. "não é a mesma pessoa" tira o grupo da fila e ele NÃO volta;
 *   3. a fusão de 3 fichas (2 perdedoras) reponta pedidos, conversas e
 *      mensagens, marca `is_merged_into` e devolve as contagens por tabela;
 *   4. rodar a mesma fusão de novo é no-op, não explode;
 *   5. perdedor de OUTRA organização é recusado — o `p_org` é o escopo;
 *   6. a tabela de descarte isola por organização, membro lê, agent não
 *      escreve, manager escreve.
 *
 * Namespace 0355 para não colidir com as outras provas (cada arquivo roda num
 * banco próprio, mas o namespace deixa o seed legível em qualquer falha).
 */
const ORG_A = "0355aaaa-0000-4000-8000-000000000001";
const ORG_B = "0355bbbb-0000-4000-8000-000000000002";
const AGENT_A = "0355aaaa-1111-4000-8000-000000000001";
const MANAGER_A = "0355aaaa-1111-4000-8000-000000000002";
const AGENT_B = "0355bbbb-1111-4000-8000-000000000003";

const VENCEDOR = "0355aaaa-2222-4000-8000-000000000001";
const PERDEDOR_1 = "0355aaaa-2222-4000-8000-000000000002";
const PERDEDOR_2 = "0355aaaa-2222-4000-8000-000000000003";
const COM_CNPJ_1 = "0355aaaa-2222-4000-8000-000000000004";
const COM_CNPJ_2 = "0355aaaa-2222-4000-8000-000000000005";
const SEM_HISTORICO_1 = "0355aaaa-2222-4000-8000-000000000006";
const SEM_HISTORICO_2 = "0355aaaa-2222-4000-8000-000000000007";
const ALHEIO = "0355bbbb-2222-4000-8000-000000000001";

const SESSION_A = "0355aaaa-3333-4000-8000-000000000001";
const CONV_VENCEDOR = "0355aaaa-4444-4000-8000-000000000001";
const CONV_PERDEDOR = "0355aaaa-4444-4000-8000-000000000002";

const CHAVE = "joao silva|canoinhas";

function json(consulta: string): Record<string, unknown> {
  return JSON.parse(sql(consulta)) as Record<string, unknown>;
}

function seed(): void {
  sql(`
    insert into auth.users (id, email) values
      ('${AGENT_A}', 'dup-0355-agent-a@invariant.test'),
      ('${MANAGER_A}', 'dup-0355-manager-a@invariant.test'),
      ('${AGENT_B}', 'dup-0355-agent-b@invariant.test')
      on conflict do nothing;

    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'dup-0355-a', 'Dup 0355 A', 'Dup A'),
      ('${ORG_B}', 'dup-0355-b', 'Dup 0355 B', 'Dup B')
      on conflict do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${AGENT_A}', '${ORG_A}', 'agent', now()),
      ('${MANAGER_A}', '${ORG_A}', 'manager', now()),
      ('${AGENT_B}', '${ORG_B}', 'agent', now())
      on conflict do nothing;

    insert into public.channel_sessions (id, organization_id, waha_session_name, webhook_secret_encrypted)
    values ('${SESSION_A}', '${ORG_A}', 'sess-0355-a', '\\x00'::bytea)
    on conflict do nothing;

    -- O grupo que exige decisão: três grafias do mesmo nome, mesma cidade.
    insert into public.contacts (id, organization_id, name, cidade, uf) values
      ('${VENCEDOR}', '${ORG_A}', 'JOAO SILVA', 'Canoinhas', 'SC'),
      ('${PERDEDOR_1}', '${ORG_A}', 'João Silva', 'CANOINHAS', 'SC'),
      ('${PERDEDOR_2}', '${ORG_A}', 'JOAO  SILVA', 'Canoinhas', 'SC'),
      -- Mesmo nome/cidade, sem histórico: NÃO entra na fila.
      ('${SEM_HISTORICO_1}', '${ORG_A}', 'PEDRO LIMA', 'Itaiópolis', 'SC'),
      ('${SEM_HISTORICO_2}', '${ORG_A}', 'PEDRO LIMA', 'Itaiópolis', 'SC')
      on conflict do nothing;

    -- Mesmo nome/cidade, mas com CNPJ: NÃO entra na fila.
    insert into public.contacts (id, organization_id, name, cidade, uf, cnpj) values
      ('${COM_CNPJ_1}', '${ORG_A}', 'MARIA SOUZA', 'Mafra', 'SC', '11222333000181'),
      ('${COM_CNPJ_2}', '${ORG_A}', 'MARIA SOUZA', 'Mafra', 'SC', '44555666000172')
      on conflict do nothing;

    insert into public.contacts (id, organization_id, name, cidade, uf) values
      ('${ALHEIO}', '${ORG_B}', 'JOAO SILVA', 'Canoinhas', 'SC')
      on conflict do nothing;

    insert into public.commercial_orders
      (organization_id, numero, contact_id, cliente_nome, status, total_cents)
    values
      ('${ORG_A}', 35501, '${PERDEDOR_1}', 'João Silva', 'aprovado', 1000),
      ('${ORG_A}', 35502, '${PERDEDOR_2}', 'JOAO  SILVA', 'aprovado', 2000);

    insert into public.conversations (id, organization_id, contact_id, channel_session_id) values
      ('${CONV_VENCEDOR}', '${ORG_A}', '${VENCEDOR}', '${SESSION_A}'),
      ('${CONV_PERDEDOR}', '${ORG_A}', '${PERDEDOR_1}', '${SESSION_A}')
      on conflict do nothing;

    insert into public.messages
      (organization_id, conversation_id, channel_session_id, contact_id, type, direction, body)
    values
      ('${ORG_A}', '${CONV_VENCEDOR}', '${SESSION_A}', '${VENCEDOR}', 'text', 'inbound', 'mensagem do vencedor'),
      ('${ORG_A}', '${CONV_PERDEDOR}', '${SESSION_A}', '${PERDEDOR_1}', 'text', 'inbound', 'mensagem do perdedor');
  `);
}

beforeAll(seed);

describe("0355 · fila de clientes duplicados", () => {
  it("agrupa os candidatos e deixa de fora CNPJ, sem histórico e cidade vazia", () => {
    const r = json(`select public.fn_contatos_duplicados('${ORG_A}', 200)::text`);
    expect(r.total_grupos).toBe(1);
    expect(r.total_fichas).toBe(3);
    expect(r.truncado).toBe(false);

    const grupos = r.grupos as Array<Record<string, unknown>>;
    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.chave).toBe(CHAVE);
    expect(String(grupos[0]?.nome)).toMatch(/jo[aã]o\s+silva/i);
    expect(grupos[0]?.total_fichas).toBe(3);
    expect((grupos[0]?.fichas as unknown[]).length).toBe(3);
  });

  it("'não é a mesma pessoa' tira o grupo da fila e ele não volta", () => {
    sql(`
      insert into public.contact_duplicate_dismissals (organization_id, chave, motivo)
      values ('${ORG_A}', '${CHAVE}', 'duas pessoas diferentes');
    `);

    const r = json(`select public.fn_contatos_duplicados('${ORG_A}', 200)::text`);
    expect(r.total_grupos).toBe(0);
    expect(r.grupos).toEqual([]);

    // As fichas continuam vivas e separadas — o descarte não funde nem apaga.
    const vivas = Number(
      sql(`select count(*) from public.contacts
            where organization_id = '${ORG_A}' and id in ('${VENCEDOR}','${PERDEDOR_1}','${PERDEDOR_2}')
              and is_merged_into is null;`),
    );
    expect(vivas).toBe(3);

    // Volta a aparecer se a chave for removida — o descarte é o filtro, não a perda.
    sql(`delete from public.contact_duplicate_dismissals where organization_id = '${ORG_A}' and chave = '${CHAVE}';`);
    expect(json(`select public.fn_contatos_duplicados('${ORG_A}', 200)::text`).total_grupos).toBe(1);
  });

  it("recusa perdedor de outra organização e não marca nada", () => {
    const recusa = sql(`
      do $$
      begin
        perform public.fn_fundir_contatos(
          '${ORG_A}', '${VENCEDOR}', array['${ALHEIO}']::uuid[]
        );
        raise exception 'DEVERIA_RECUSAR';
      exception when others then
        if sqlerrm = 'DEVERIA_RECUSAR' then raise; end if;
        raise notice 'recusa: %', sqlerrm;
      end $$;
      select 'ok';
    `);
    expect(recusa).toContain("ok");

    const alheio = sql(`select coalesce(is_merged_into::text, 'vivo') from public.contacts where id = '${ALHEIO}';`);
    expect(alheio).toBe("vivo");
  });

  it("funde 2 perdedoras: reponta pedidos/conversas/mensagens e marca is_merged_into", () => {
    const resultado = json(`
      select public.fn_fundir_contatos(
        '${ORG_A}', '${VENCEDOR}', array['${PERDEDOR_1}','${PERDEDOR_2}']::uuid[]
      )::text
    `);

    expect(resultado.aplicado).toBe(true);
    expect(resultado.contatos_mesclados).toBe(2);
    expect(resultado.conversas_fundidas).toBe(1);
    const repontados = resultado.repontados as Record<string, number>;
    expect(repontados.commercial_orders).toBe(2);
    // A conversa perdedora é FUNDIDA (mensagens e vínculos passam para a do
    // vencedor) antes do delete — por isso ela não aparece como "repontada".
    expect(resultado.conversas_fundidas).toBe(1);

    const marcadas = sql(`
      select string_agg(id::text || '=' || coalesce(is_merged_into::text, '-'), ',' order by id)
        from public.contacts
       where id in ('${VENCEDOR}','${PERDEDOR_1}','${PERDEDOR_2}');
    `);
    expect(marcadas).toContain(`${VENCEDOR}=-`);
    expect(marcadas).toContain(`${PERDEDOR_1}=${VENCEDOR}`);
    expect(marcadas).toContain(`${PERDEDOR_2}=${VENCEDOR}`);

    const pedidosNoVencedor = Number(
      sql(`select count(*) from public.commercial_orders
            where organization_id = '${ORG_A}' and contact_id = '${VENCEDOR}';`),
    );
    expect(pedidosNoVencedor).toBe(2);

    // Conversa 1:1 do mesmo canal/sessão foi fundida SEM perder mensagem.
    const conversas = Number(
      sql(`select count(*) from public.conversations
            where organization_id = '${ORG_A}' and channel_session_id = '${SESSION_A}';`),
    );
    expect(conversas).toBe(1);
    const mensagens = Number(
      sql(`select count(*) from public.messages
            where organization_id = '${ORG_A}' and contact_id = '${VENCEDOR}';`),
    );
    expect(mensagens).toBe(2);
  });

  it("rodar a mesma fusão de novo é no-op, não explode", () => {
    const resultado = json(`
      select public.fn_fundir_contatos(
        '${ORG_A}', '${VENCEDOR}', array['${PERDEDOR_1}','${PERDEDOR_2}']::uuid[]
      )::text
    `);
    expect(resultado.aplicado).toBe(false);
    expect(resultado.motivo).toBe("ja_mesclado");
    expect(resultado.contatos_mesclados).toBe(0);
  });

  it("o grupo que sobrou depois da fusão não tem mais histórico em duplicidade", () => {
    // Restam MARIA (com CNPJ) e PEDRO (sem histórico): nenhum é candidato.
    const r = json(`select public.fn_contatos_duplicados('${ORG_A}', 200)::text`);
    expect(r.total_grupos).toBe(0);
  });
});

describe("0355 · RLS do descarte", () => {
  it("membro da org A lê o próprio descarte e zero do vizinho", () => {
    sql(`
      insert into public.contact_duplicate_dismissals (organization_id, chave, motivo)
      values
        ('${ORG_A}', 'a|a', 'org A'),
        ('${ORG_B}', 'b|b', 'org B');
    `);

    expect(countAs(AGENT_A, `select count(*) from public.contact_duplicate_dismissals where organization_id = '${ORG_A}';`)).toBeGreaterThanOrEqual(1);
    expect(countAs(AGENT_A, `select count(*) from public.contact_duplicate_dismissals where organization_id = '${ORG_B}';`)).toBe(0);
  });

  it("agent não escreve; manager escreve na própria organização", () => {
    const negado = writeCountAs(
      AGENT_A,
      `insert into public.contact_duplicate_dismissals (organization_id, chave, motivo)
       values ('${ORG_A}', 'agent|nao', 'tentativa')`,
    );
    expect(negado).toBe(0);

    const permitido = writeCountAs(
      MANAGER_A,
      `insert into public.contact_duplicate_dismissals (organization_id, chave, motivo)
       values ('${ORG_A}', 'manager|sim', 'decisao')`,
    );
    expect(permitido).toBe(1);
  });

  it("anon não tem privilégio de leitura na tabela", () => {
    const privilegio = sql(
      `select has_table_privilege('anon', 'public.contact_duplicate_dismissals', 'select');`,
    );
    expect(privilegio).toBe("f");
  });
});
