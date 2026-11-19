import { beforeAll, describe, expect, it } from "vitest";

import { lastLine, sql } from "./gov-helpers";

/**
 * 0328 — liberar claim de conversa parada, com CAS e reversão honesta.
 *
 *  - libera `claimed` há 7+ dias sem mensagem, grava `open` + evento antes/depois
 *    na mesma transação;
 *  - reverter restaura o responsável enquanto ninguém assumiu;
 *  - se outro agente assumiu, reverter devolve zero linhas (não rouba);
 *  - outra org/regra/entidade é recusa dura.
 */

const ORG_A = "a0280000-0000-4000-8000-000000000001";
const ORG_B = "b0280000-0000-4000-8000-000000000002";
const USER_A = "a0280000-1111-4000-8000-000000000001";
const USER_B = "b0280000-1111-4000-8000-000000000002";

const CONTACT_A = "a0280000-2222-4000-8000-000000000001";
const SESSION_A = "a0280000-3333-4000-8000-000000000001";
const CONV_A = "a0280000-4444-4000-8000-000000000001";
const OCC_A = "a0280000-5555-4000-8000-000000000001";

const CONV_B = "b0280000-4444-4000-8000-000000000002";
const OCC_B = "b0280000-5555-4000-8000-000000000002";

const MSG_A1 = "a0280000-6666-4000-8000-000000000001";
const MSG_A2 = "a0280000-6666-4000-8000-000000000002";

function liberar(org: string, occ: string, conversa: string): number {
  return Number(
    lastLine(
      sql(`
        select count(*) from public.fn_sentinel_liberar_conversa(
          '${org}', '${occ}', '${USER_A}', 'responsável de férias',
          (select assigned_to_user_id from public.conversations where id = '${conversa}'),
          (select assigned_at from public.conversations where id = '${conversa}')
        );
      `),
    ),
  );
}

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${USER_A}', 'conversa-a@invariant.test'),
      ('${USER_B}', 'conversa-b@invariant.test')
      on conflict (id) do nothing;

    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'conversa-correcao-a', 'Conversa A', 'Conversa A'),
      ('${ORG_B}', 'conversa-correcao-b', 'Conversa B', 'Conversa B')
      on conflict (id) do nothing;

    insert into public.contacts (id, organization_id, name) values
      ('${CONTACT_A}', '${ORG_A}', 'Contato A')
      on conflict (id) do nothing;

    insert into public.channel_sessions
      (id, organization_id, waha_session_name, webhook_secret_encrypted, status)
    values
      ('${SESSION_A}', '${ORG_A}', 'conversa-a', '\\x00'::bytea, 'WORKING')
      on conflict (id) do nothing;

    insert into public.conversations
      (id, organization_id, contact_id, channel_session_id, status,
       assigned_to_user_id, assigned_at, last_message_at)
    values
      ('${CONV_A}', '${ORG_A}', '${CONTACT_A}', '${SESSION_A}', 'claimed',
       '${USER_A}', now() - interval '10 days', now() - interval '9 days'),
      ('${CONV_B}', '${ORG_B}', '${CONTACT_A}', '${SESSION_A}', 'claimed',
       '${USER_A}', now() - interval '10 days', now() - interval '9 days')
    on conflict (id) do nothing;

    insert into public.messages
      (id, organization_id, conversation_id, channel_session_id, contact_id,
       type, direction, status, body, sent_at)
    values
      ('${MSG_A1}', '${ORG_A}', '${CONV_A}', '${SESSION_A}', '${CONTACT_A}',
       'text', 'inbound', 'received', 'primeira mensagem', now() - interval '12 days'),
      ('${MSG_A2}', '${ORG_A}', '${CONV_A}', '${SESSION_A}', '${CONTACT_A}',
       'text', 'outbound', 'sent', 'segunda mensagem', now() - interval '9 days')
    on conflict (id) do nothing;

    insert into public.sentinel_occurrences
      (id, organization_id, fingerprint, regra, categoria, entidade_tipo, entidade_id,
       titulo, resumo, causa_provavel, severidade, estado)
    values
      ('${OCC_A}', '${ORG_A}', 'fp-conversa-a', 'operacao.conversa_claim_parado',
       'operacao', 'conversations', '${CONV_A}', 'Conversa parada', 'Sem mensagem.',
       'Claim sem TTL.', 'media', 'aprovada'),
      ('${OCC_B}', '${ORG_B}', 'fp-conversa-b', 'operacao.conversa_claim_parado',
       'operacao', 'conversations', '${CONV_B}', 'Conversa parada', 'Sem mensagem.',
       'Claim sem TTL.', 'media', 'aprovada')
    on conflict (id) do nothing;
  `);
});

describe("Sentinel — liberar conversa parada (0328)", () => {
  it("libera o claim, abre a conversa e grava o antes/depois", () => {
    const mensagensAntes = sql(
      `select count(*) || ':' || string_agg(body, '|' order by sent_at) from public.messages where conversation_id = '${CONV_A}';`,
    );

    expect(liberar(ORG_A, OCC_A, CONV_A)).toBe(1);
    expect(
      sql(`select status || ':' || coalesce(assigned_to_user_id::text, 'sem') from public.conversations where id = '${CONV_A}';`),
    ).toBe("open:sem");

    // Liberar o claim não apaga nem reescreve o histórico da conversa.
    expect(
      sql(`select count(*) || ':' || string_agg(body, '|' order by sent_at) from public.messages where conversation_id = '${CONV_A}';`),
    ).toBe(mensagensAntes);
    expect(mensagensAntes).toBe("2:primeira mensagem|segunda mensagem");

    // Reexecutar a mesma liberação não duplica evento nem muda o desfecho.
    const eventosAntes = Number(
      sql(`select count(*) from public.sentinel_occurrence_events where occurrence_id = '${OCC_A}';`),
    );
    expect(liberar(ORG_A, OCC_A, CONV_A)).toBe(0);
    expect(
      Number(
        sql(`select count(*) from public.sentinel_occurrence_events where occurrence_id = '${OCC_A}';`),
      ),
    ).toBe(eventosAntes);
    expect(
      sql(`select estado from public.sentinel_occurrences where id = '${OCC_A}';`),
    ).toBe("corrigida");
    expect(
      sql(`select estado from public.sentinel_occurrences where id = '${OCC_A}';`),
    ).toBe("corrigida");
    expect(
      sql(`select tipo || ':' || coalesce(detalhe->>'correcao','—') from public.sentinel_occurrence_events where occurrence_id = '${OCC_A}' order by created_at desc limit 1;`),
    ).toBe("nota:liberar_conversa");
    expect(
      sql(`select detalhe->>'motivo' from public.sentinel_occurrence_events where occurrence_id = '${OCC_A}' order by created_at desc limit 1;`),
    ).toBe("responsável de férias");
  });

  it("reverte enquanto ninguém assumiu e restaura o responsável", () => {
    const reverteu = Number(
      lastLine(
        sql(`select count(*) from public.fn_sentinel_reverter_liberacao_conversa('${ORG_A}', '${OCC_A}', '${USER_A}');`),
      ),
    );
    expect(reverteu).toBe(1);
    expect(
      sql(`select status || ':' || assigned_to_user_id::text from public.conversations where id = '${CONV_A}';`),
    ).toBe(`claimed:${USER_A}`);
    expect(
      sql(`select estado from public.sentinel_occurrences where id = '${OCC_A}';`),
    ).toBe("nova");
    expect(
      sql(`select tipo from public.sentinel_occurrence_events where occurrence_id = '${OCC_A}' order by created_at desc limit 1;`),
    ).toBe("reaberta");
  });

  it("se outro agente assumiu, reverter devolve zero linhas e não rouba", () => {
    // Aprova de novo e libera; depois outro agente assume.
    sql(`update public.sentinel_occurrences set estado = 'aprovada' where id = '${OCC_A}';`);
    expect(liberar(ORG_A, OCC_A, CONV_A)).toBe(1);
    sql(`
      update public.conversations
         set status = 'claimed', assigned_to_user_id = '${USER_B}',
             assigned_at = now(), status_changed_at = now(), updated_at = now()
       where id = '${CONV_A}';
    `);

    const reverteu = Number(
      lastLine(
        sql(`select count(*) from public.fn_sentinel_reverter_liberacao_conversa('${ORG_A}', '${OCC_A}', '${USER_A}');`),
      ),
    );
    expect(reverteu).toBe(0);
    expect(
      sql(`select assigned_to_user_id::text from public.conversations where id = '${CONV_A}';`),
    ).toBe(USER_B);
    expect(
      sql(`select estado from public.sentinel_occurrences where id = '${OCC_A}';`),
    ).toBe("corrigida");
  });

  it("outra org/regra e sem motivo são recusa dura", () => {
    // OCC_B é de outra org: a chamada com ORG_A não encontra ocorrência.
    expect(liberar(ORG_A, OCC_B, CONV_B)).toBe(0);

    const semMotivo = Number(
      lastLine(
        sql(`
          select count(*) from public.fn_sentinel_liberar_conversa(
            '${ORG_A}', '${OCC_A}', '${USER_A}', '  ',
            '${USER_A}', now() - interval '10 days'
          );
        `),
      ),
    );
    expect(semMotivo).toBe(0);
  });
});
