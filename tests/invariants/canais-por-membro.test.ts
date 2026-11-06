import { beforeAll, describe, expect, it } from "vitest";

import { countAs, lastLine, sql } from "./gov-helpers";

/**
 * 0296 — cada membro enxerga os números liberados no inbox.
 *
 * A separação entre conta administrativa (avisos de carga, número de
 * expedição) e conta comercial (oficial Meta + comercial) NÃO pode ser só
 * cosmética: esconder o número na tela e continuar entregando as conversas
 * pela API deixaria a conta administrativa lendo o atendimento inteiro pelo
 * PostgREST. O que vale é a RLS — `fn_can_view_channel` no SELECT de
 * `conversations`, e `messages` herdando pelo `exists`.
 *
 * Namespace 99999999 = exclusivo deste arquivo (cccccccc/dddddddd/eeeeeeee/
 * ffffffff já são usados pelos outros invariantes que rodam em paralelo).
 *
 * Todos os membros das probes são `manager` de propósito: manager é org-wide
 * na 0035, então um 0 aqui só pode vir do eixo NOVO (o número) — visibility_mode
 * não confunde a leitura do resultado.
 */

const ORG = "99999999-0000-4000-8000-000000000001";
const RESTRITO = "99999999-1111-4000-8000-000000000001";
const IRRESTRITO = "99999999-1111-4000-8000-000000000002";
const SEM_NENHUM = "99999999-1111-4000-8000-000000000003";
const PLATFORM_ADMIN = "99999999-1111-4000-8000-000000000004";

const CANAL_EXPEDICAO = "99999999-2222-4000-8000-000000000001";
const CANAL_COMERCIAL = "99999999-2222-4000-8000-000000000002";

const CONTATO_EXP = "99999999-3333-4000-8000-000000000001";
const CONTATO_COM = "99999999-3333-4000-8000-000000000002";

const CONV_EXP = "99999999-4444-4000-8000-000000000001";
const CONV_COM = "99999999-4444-4000-8000-000000000002";

const MSG_EXP = "99999999-7777-4000-8000-000000000001";
const MSG_COM = "99999999-7777-4000-8000-000000000002";

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${RESTRITO}', 'canal-restrito@invariant.test'),
      ('${IRRESTRITO}', 'canal-irrestrito@invariant.test'),
      ('${SEM_NENHUM}', 'canal-sem-nenhum@invariant.test'),
      ('${PLATFORM_ADMIN}', 'canal-platform-admin@invariant.test')
    on conflict do nothing;

    insert into public.organizations (id, slug, legal_name, display_name, settings)
      values ('${ORG}', 'canais-por-membro', 'Canais por Membro', 'Canais por Membro',
              jsonb_build_object('visibility_mode', 'all'))
      on conflict do nothing;

    insert into public.user_organizations
      (user_id, organization_id, role, accepted_at, canais_permitidos)
    values
      ('${RESTRITO}', '${ORG}', 'manager', now(), array['${CANAL_EXPEDICAO}']::uuid[]),
      ('${IRRESTRITO}', '${ORG}', 'manager', now(), null),
      ('${SEM_NENHUM}', '${ORG}', 'manager', now(), '{}'::uuid[])
    on conflict do nothing;

    -- Platform admin de verdade (a função lê a tabela, não um claim do JWT).
    insert into public.platform_admins (user_id, granted_by, reason)
      values ('${PLATFORM_ADMIN}', '${PLATFORM_ADMIN}', 'invariante 0296')
    on conflict do nothing;

    do $canais$ begin
      insert into public.channel_sessions
        (id, organization_id, waha_session_name, webhook_secret_encrypted)
      values
        ('${CANAL_EXPEDICAO}', '${ORG}', 'canal-expedicao', '\\x00'::bytea),
        ('${CANAL_COMERCIAL}', '${ORG}', 'canal-comercial', '\\x00'::bytea);
    exception when unique_violation then null; end $canais$;

    insert into public.contacts (id, organization_id, display_name) values
      ('${CONTATO_EXP}', '${ORG}', 'Contato Expedição'),
      ('${CONTATO_COM}', '${ORG}', 'Contato Comercial')
    on conflict do nothing;

    insert into public.conversations
      (id, organization_id, contact_id, channel_session_id, status)
    values
      ('${CONV_EXP}', '${ORG}', '${CONTATO_EXP}', '${CANAL_EXPEDICAO}', 'open'),
      ('${CONV_COM}', '${ORG}', '${CONTATO_COM}', '${CANAL_COMERCIAL}', 'open')
    on conflict do nothing;

    insert into public.messages
      (id, organization_id, conversation_id, channel_session_id, contact_id, type, direction, body)
    values
      ('${MSG_EXP}', '${ORG}', '${CONV_EXP}', '${CANAL_EXPEDICAO}', '${CONTATO_EXP}',
       'text', 'inbound', 'aviso de carga'),
      ('${MSG_COM}', '${ORG}', '${CONV_COM}', '${CANAL_COMERCIAL}', '${CONTATO_COM}',
       'text', 'inbound', 'mensagem comercial')
    on conflict (id) do nothing;
  `);
});

function visivel(userId: string, canalId: string): boolean {
  return (
    lastLine(
      sql(`
        set role authenticated;
        select set_config('request.jwt.claims', '{"sub":"${userId}"}', false);
        select public.fn_can_view_channel('${ORG}', '${canalId}')::int;
      `),
    ) === "1"
  );
}

describe("0296 — números por membro", () => {
  it("allowlist deixa ver a conversa do número liberado", () => {
    expect(
      countAs(RESTRITO, `select count(*) from public.conversations where id = '${CONV_EXP}';`),
    ).toBe(1);
  });

  it("allowlist esconde a conversa do número NÃO liberado", () => {
    expect(
      countAs(RESTRITO, `select count(*) from public.conversations where id = '${CONV_COM}';`),
    ).toBe(0);
  });

  it("mensagem herda o número da conversa (não vaza pelo caminho de messages)", () => {
    expect(
      countAs(RESTRITO, `select count(*) from public.messages where id = '${MSG_EXP}';`),
    ).toBe(1);
    expect(
      countAs(RESTRITO, `select count(*) from public.messages where id = '${MSG_COM}';`),
    ).toBe(0);
  });

  it("NULL (o passado) continua vendo todos os números — controle positivo", () => {
    expect(
      countAs(
        IRRESTRITO,
        `select count(*) from public.conversations
           where id in ('${CONV_EXP}', '${CONV_COM}');`,
      ),
    ).toBe(2);
  });

  it("{} não vê NENHUM — e não é o mesmo que NULL", () => {
    expect(
      countAs(
        SEM_NENHUM,
        `select count(*) from public.conversations
           where id in ('${CONV_EXP}', '${CONV_COM}');`,
      ),
    ).toBe(0);
  });

  it("platform admin atravessa o escopo (é a válvula de manutenção)", () => {
    expect(
      countAs(
        PLATFORM_ADMIN,
        `select count(*) from public.conversations
           where id in ('${CONV_EXP}', '${CONV_COM}');`,
      ),
    ).toBe(2);
  });

  it("fn_can_view_channel responde por número, inclusive para canal nulo", () => {
    expect(visivel(RESTRITO, CANAL_EXPEDICAO)).toBe(true);
    expect(visivel(RESTRITO, CANAL_COMERCIAL)).toBe(false);
    // Conversa sem sessão (channel_session_id NULL) não é um dos números
    // autorizados: fica invisível para quem tem allowlist.
    expect(
      lastLine(
        sql(`
          set role authenticated;
          select set_config('request.jwt.claims', '{"sub":"${RESTRITO}"}', false);
          select public.fn_can_view_channel('${ORG}', null)::int;
        `),
      ),
    ).toBe("0");
  });

  it("anon NÃO executa fn_can_view_channel", () => {
    expect(
      lastLine(
        sql(`select has_function_privilege('anon', 'public.fn_can_view_channel(uuid, uuid)', 'execute')::int;`),
      ),
    ).toBe("0");
  });

  it("authenticated executa — sem isto toda leitura logada de conversa quebra", () => {
    expect(
      lastLine(
        sql(
          `select has_function_privilege('authenticated', 'public.fn_can_view_channel(uuid, uuid)', 'execute')::int;`,
        ),
      ),
    ).toBe("1");
  });
});
