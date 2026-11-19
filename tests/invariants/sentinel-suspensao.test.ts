import { beforeAll, describe, expect, it } from "vitest";

import { lastLine, sql } from "./gov-helpers";

/**
 * 0329 — organização suspensa não alimenta o Sentinel.
 *
 * O app prova que a coleta não roda (lib/sentinel/execucao-suspensa.test.ts).
 * Aqui o banco prova o que sobra para ele: encerrar as ocorrências ABERTAS com
 * motivo declarado, preservando linha e histórico; rodar duas vezes não gera
 * evento extra nem reabre nada; e a organização vizinha fica intacta.
 */

const ORG_ATIVA = "a0290000-0000-4000-8000-000000000001";
const ORG_SUSPENSA = "b0290000-0000-4000-8000-000000000002";
const USER_A = "a0290000-1111-4000-8000-000000000001";
const USER_B = "b0290000-1111-4000-8000-000000000002";

const RUN_ATIVA = "a0290000-2222-4000-8000-000000000001";
const RUN_SUSPENSA = "b0290000-2222-4000-8000-000000000002";

const REGRA = "operacao.estoque_negativo";

function registrar(org: string, run: string, fp: string): string {
  return lastLine(
    sql(`
      select ocorrencia_id::text
        from public.fn_sentinel_registrar_ocorrencia(
          '${org}', '${run}', '${fp}', '${REGRA}', 'operacao',
          'catalog_products', 'seed-1', 'Produto com saldo negativo',
          'O saldo ficou abaixo de zero.', 'Saída sem entrada.', 'alta',
          '/app/estoque', '{"quantidade":-1,"codigo":"SKU-1"}'::jsonb,
          '{"resumo":"Contar e ajustar","passos":["Conte fisicamente"],"campos_pendentes":["contagem"],"risco":"medio","reversibilidade":"reversivel","exige_aprovacao":true,"fonte":["catalog_products"],"limitacao":null,"confianca":"alta"}'::jsonb
        );
    `),
  );
}

function campo(id: string, coluna: string): string {
  return lastLine(
    sql(`select coalesce(${coluna}::text, 'null') from public.sentinel_occurrences where id = '${id}';`),
  );
}

function eventos(id: string): number {
  return Number(
    lastLine(
      sql(`select count(*) from public.sentinel_occurrence_events where occurrence_id = '${id}';`),
    ),
  );
}

function encerrar(org: string, run: string): number {
  return Number(
    lastLine(
      sql(`select public.fn_sentinel_encerrar_org_suspensa('${org}', '${run}');`),
    ),
  );
}

let daSuspensa = "";
let daAtiva = "";

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${USER_A}', 'suspensao-a@invariant.test'),
      ('${USER_B}', 'suspensao-b@invariant.test')
      on conflict (id) do nothing;

    insert into public.organizations (id, slug, legal_name, display_name, suspended_at) values
      ('${ORG_ATIVA}', 'suspensao-ativa', 'Suspensão Ativa', 'Suspensão Ativa', null),
      ('${ORG_SUSPENSA}', 'suspensao-suspensa', 'Suspensão Suspensa', 'Suspensão Suspensa', now())
      on conflict (id) do update set suspended_at = excluded.suspended_at;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${USER_A}', '${ORG_ATIVA}', 'agent', now()),
      ('${USER_B}', '${ORG_SUSPENSA}', 'agent', now())
      on conflict do nothing;

    insert into public.sentinel_runs (id, organization_id, origem, status, finalizado_em) values
      ('${RUN_ATIVA}', '${ORG_ATIVA}', 'cron', 'sucesso', now()),
      ('${RUN_SUSPENSA}', '${ORG_SUSPENSA}', 'cron', 'sucesso', now())
      on conflict (id) do nothing;
  `);

  daSuspensa = registrar(ORG_SUSPENSA, RUN_SUSPENSA, `${REGRA}|catalog_products|suspensa`);
  daAtiva = registrar(ORG_ATIVA, RUN_ATIVA, `${REGRA}|catalog_products|ativa`);
});

describe("Sentinel — organização suspensa (0329)", () => {
  it("encerra a ocorrência aberta com motivo declarado e preserva o histórico", () => {
    expect(campo(daSuspensa, "estado")).toBe("nova");
    const antes = eventos(daSuspensa);
    expect(antes).toBeGreaterThan(0);

    expect(encerrar(ORG_SUSPENSA, RUN_SUSPENSA)).toBe(1);

    expect(campo(daSuspensa, "estado")).toBe("encerrada");
    expect(campo(daSuspensa, "motivo_encerramento")).toBe("organizacao_suspensa");
    expect(campo(daSuspensa, "encerrada_em")).not.toBe("null");
    // Linha preservada + evento NOVO de fechamento; o histórico anterior fica.
    expect(eventos(daSuspensa)).toBe(antes + 1);
    expect(
      lastLine(
        sql(`
          select estado_anterior || '>' || estado_novo || ':' || (detalhe->>'motivo')
            from public.sentinel_occurrence_events
           where occurrence_id = '${daSuspensa}'
           order by created_at desc
           limit 1;
        `),
      ),
    ).toBe("nova>encerrada:organizacao_suspensa");
  });

  it("rodar de novo não reabre, não encerra de novo e não duplica evento", () => {
    const antes = eventos(daSuspensa);
    expect(encerrar(ORG_SUSPENSA, RUN_SUSPENSA)).toBe(0);
    expect(encerrar(ORG_SUSPENSA, RUN_SUSPENSA)).toBe(0);

    expect(campo(daSuspensa, "estado")).toBe("encerrada");
    expect(campo(daSuspensa, "motivo_encerramento")).toBe("organizacao_suspensa");
    expect(eventos(daSuspensa)).toBe(antes);
  });

  it("organização ativa continua aberta e intocada", () => {
    expect(campo(daAtiva, "estado")).toBe("nova");
    expect(campo(daAtiva, "motivo_encerramento")).toBe("null");
    expect(encerrar(ORG_ATIVA, RUN_ATIVA)).toBe(1);
    expect(campo(daAtiva, "estado")).toBe("encerrada");
  });

  it("a suspensa só é alcançada pela própria organização", () => {
    // Reabre a da suspensa para o teste de isolamento.
    sql(`
      update public.sentinel_occurrences
         set estado = 'nova', motivo_encerramento = null, encerrada_em = null
       where id = '${daSuspensa}';
    `);
    expect(encerrar(ORG_ATIVA, RUN_ATIVA)).toBe(0);
    expect(campo(daSuspensa, "estado")).toBe("nova");
    expect(encerrar(ORG_SUSPENSA, RUN_SUSPENSA)).toBe(1);
    expect(campo(daSuspensa, "estado")).toBe("encerrada");
  });
});
