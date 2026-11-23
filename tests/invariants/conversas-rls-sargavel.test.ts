import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * 0340 — a policy de SELECT de conversas precisa ser SET-BASED.
 *
 * Produção: 929 ms com RLS contra 3,8 ms sem ela — 2.138 de 2.162 linhas
 * removidas uma a uma por `fn_can_view_conversation/channel`. O teste abaixo
 * não mede latência de produção (volume é outro); mede a FORMA do plano e a
 * ausência das chamadas por linha no texto da policy, no piso pg15 do gate.
 */
describe("0340 — RLS sargável de conversas", () => {
  it("a policy não chama funções com argumento de coluna", () => {
    const def = sql(`
      select qual as definition from pg_policies
       where schemaname='public' and tablename='conversations'
         and policyname='conversations_select'
    `);
    expect(def).not.toContain("fn_can_view_conversation(");
    expect(def).not.toContain("fn_can_view_channel(");
    expect(def).toContain("user_organizations");
  });

  it("o plano com RLS usa o índice por organização, não varredura da tabela", () => {
    const ORG = "0340aaaa-0000-4000-8000-000000000001";
    const USER = "0340bbbb-0000-4000-8000-000000000002";
    // Banco de invariante nasce vazio: fixture sintética com volume para o
    // planejador escolher entre Seq Scan e índice.
    sql(`
      insert into auth.users (id, email) values ('${USER}', 'viewer-0340@nexus.test')
      on conflict (id) do nothing;
      insert into public.organizations (id, slug, display_name, legal_name)
      values ('${ORG}', 'rls-sargavel', 'RLS Sargável', 'RLS Sargável')
      on conflict (id) do nothing;
      insert into public.user_organizations (user_id, organization_id, role, accepted_at)
      values ('${USER}', '${ORG}', 'viewer', now())
      on conflict do nothing;
      insert into public.contacts (id, organization_id, display_name)
      select gen_random_uuid(), '${ORG}', 'contato-' || n
        from generate_series(1, 200) n;
      insert into public.channel_sessions (id, organization_id, phone_number, webhook_secret_encrypted, waha_session_name)
      select gen_random_uuid(), '${ORG}', '+551199999' || lpad(n::text, 5, '0'), 'fixture', 'session-' || n
        from generate_series(1, 200) n;
      insert into public.conversations (id, organization_id, contact_id, channel_session_id, last_message_at)
      select gen_random_uuid(), c.organization_id, c.id, cs.id, now() - interval '1 minute'
        from public.contacts c
        join public.channel_sessions cs on cs.organization_id = c.organization_id
       where c.organization_id = '${ORG}';
    `);
    const org = ORG;
    const user = USER;

    const plano = sql(`
      set role authenticated;
      select set_config('request.jwt.claims', '{"sub":"${user}"}', false);
      explain (analyze, buffers)
      select id from public.conversations
       where organization_id='${org}'
       order by last_message_at desc nulls last, id desc limit 51;
    `);
    expect(plano).toContain("Index Scan");
    expect(plano).not.toContain("Seq Scan on conversations");
  });
});
