import { beforeAll, describe, expect, it } from "vitest";

import { countAs, lastLine, sql } from "./gov-helpers";

/**
 * As promessas do Sentinel que só o BANCO pode provar:
 *
 *  - reexecução NÃO duplica ocorrência (índice parcial + upsert);
 *  - reencontro incrementa `vezes_vista` e grava `reafirmada`;
 *  - evento que volta depois de fechado nasce `recorrente`, sem apagar histórico;
 *  - execução que não reencontra encerra com evento `auto_encerrada`;
 *  - mudança de estado + evento são atômicos;
 *  - retenção apaga só terminal vencido e tem piso;
 *  - usuário de outra organização não lê nada.
 */

const ORG_A = "a0130000-0000-4000-8000-000000000001";
const ORG_B = "b0130000-0000-4000-8000-000000000002";
const USER_A = "a0130000-1111-4000-8000-000000000001";
const USER_B = "b0130000-1111-4000-8000-000000000002";

const RUN_A1 = "a0130000-2222-4000-8000-000000000001";
const RUN_A2 = "a0130000-2222-4000-8000-000000000002";
const RUN_A3 = "a0130000-2222-4000-8000-000000000003";
const RUN_B1 = "b0130000-2222-4000-8000-000000000004";

const FP = "operacao.estoque_negativo|catalog_products|seed-1";
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

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${USER_A}', 'sentinel-a@invariant.test'),
      ('${USER_B}', 'sentinel-b@invariant.test')
      on conflict (id) do nothing;

    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'sentinel-a', 'Sentinel A', 'Sentinel A'),
      ('${ORG_B}', 'sentinel-b', 'Sentinel B', 'Sentinel B')
      on conflict (id) do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${USER_A}', '${ORG_A}', 'agent', now()),
      ('${USER_B}', '${ORG_B}', 'agent', now())
      on conflict do nothing;

    insert into public.sentinel_runs (id, organization_id, origem, status, finalizado_em) values
      ('${RUN_A1}', '${ORG_A}', 'manual', 'sucesso', now()),
      ('${RUN_A2}', '${ORG_A}', 'cron', 'sucesso', now()),
      ('${RUN_A3}', '${ORG_A}', 'cron', 'sucesso', now()),
      ('${RUN_B1}', '${ORG_B}', 'cron', 'sucesso', now())
      on conflict (id) do nothing;
  `);
});

describe("Sentinel — idempotência, recorrência e retenção", () => {
  it("reexecução atualiza a aberta: uma linha, vezes_vista 2, detectada + reafirmada", () => {
    const id1 = registrar(ORG_A, RUN_A1, FP);
    const id2 = registrar(ORG_A, RUN_A1, FP);

    expect(id2).toBe(id1);
    expect(
      Number(sql(`select count(*) from public.sentinel_occurrences where organization_id = '${ORG_A}' and fingerprint = '${FP}';`)),
    ).toBe(1);
    expect(
      Number(sql(`select vezes_vista from public.sentinel_occurrences where id = '${id1}';`)),
    ).toBe(2);
    expect(
      sql(`select recomendacao->>'risco' from public.sentinel_occurrences where id = '${id1}';`),
    ).toBe("medio");
    expect(
      sql(`select tipo from public.sentinel_occurrence_events where occurrence_id = '${id1}' order by created_at, tipo;`),
    ).toBe("detectada\nreafirmada");
  });

  it("organização vizinha não lê a ocorrência (RLS + service role filtrando org)", () => {
    registrar(ORG_B, RUN_B1, "operacao.estoque_negativo|catalog_products|seed-b");
    const cross = countAs(
      USER_A,
      `select count(*) from public.sentinel_occurrences where organization_id = '${ORG_B}';`,
    );
    expect(cross).toBe(0);
  });

  it("não reencontrada: encerra com evento auto_encerrada e mantém a linha", () => {
    const fechadas = Number(
      lastLine(
        sql(`
          select public.fn_sentinel_encerrar_ausentes(
            '${ORG_A}', '${RUN_A3}', array['${REGRA}']
          );
        `),
      ),
    );
    expect(fechadas).toBe(1);
    expect(
      sql(`select estado || ':' || coalesce(motivo_encerramento, '—') from public.sentinel_occurrences where organization_id = '${ORG_A}' and fingerprint = '${FP}';`),
    ).toBe("encerrada:nao_detectada_na_execucao");
    expect(
      Number(sql(`select count(*) from public.sentinel_occurrence_events where organization_id = '${ORG_A}' and tipo = 'auto_encerrada';`)),
    ).toBe(1);
  });

  it("volta depois de fechada: nova linha recorrente com a contagem anterior", () => {
    const nova = registrar(ORG_A, RUN_A3, FP);
    expect(
      Number(sql(`select count(*) from public.sentinel_occurrences where organization_id = '${ORG_A}' and fingerprint = '${FP}';`)),
    ).toBe(2);
    expect(
      sql(`select estado || ':' || recorrencias from public.sentinel_occurrences where id = '${nova}';`),
    ).toBe("recorrente:1");
  });

  it("mudança de estado grava estado + evento na mesma chamada; org errada não alcança", () => {
    const aberta = lastLine(
      sql(`select id::text from public.sentinel_occurrences where organization_id = '${ORG_A}' and estado = 'recorrente' limit 1;`),
    );

    const semLinha = sql(`
      select count(*) from public.fn_sentinel_aplicar_mudanca(
        '${ORG_B}', '${aberta}', 'investigando', null, null, null, null, '${USER_B}', 'tentativa cross-tenant'
      );
    `);
    expect(Number(lastLine(semLinha))).toBe(0);

    const linha = lastLine(
      sql(`
        select estado_anterior || '->' || estado_novo
          from public.fn_sentinel_aplicar_mudanca(
            '${ORG_A}', '${aberta}', 'investigando', null, null, null, null,
            '${USER_A}', 'assumindo'
          );
      `),
    );
    expect(linha).toBe("recorrente->investigando");
    expect(
      sql(`select estado from public.sentinel_occurrences where id = '${aberta}';`),
    ).toBe("investigando");
    expect(
      Number(sql(`select count(*) from public.sentinel_occurrence_events where occurrence_id = '${aberta}' and tipo = 'estado_alterado' and ator_user_id = '${USER_A}';`)),
    ).toBe(1);
  });

  it("retenção: apaga terminal vencida, respeita piso e nunca toca ocorrência aberta", () => {
    const antiga = lastLine(
      sql(`select id::text from public.sentinel_occurrences where organization_id = '${ORG_A}' and estado = 'encerrada' limit 1;`),
    );
    sql(`
      update public.sentinel_occurrences
         set encerrada_em = now() - interval '200 days',
             updated_at = now() - interval '200 days'
       where id = '${antiga}';
    `);

    // Piso de 30 dias dentro da função: pedir 1 apaga o que tem 200 dias.
    const apagadas = Number(
      lastLine(sql(`select public.fn_sentinel_expurgar('${ORG_A}', 1);`)),
    );
    expect(apagadas).toBeGreaterThanOrEqual(1);
    expect(
      Number(sql(`select count(*) from public.sentinel_occurrences where id = '${antiga}';`)),
    ).toBe(0);

    // A aberta continua (investigando), mesmo pedindo retenção zero.
    expect(
      Number(sql(`select count(*) from public.sentinel_occurrences where organization_id = '${ORG_A}' and estado = 'investigando';`)),
    ).toBeGreaterThanOrEqual(1);
  });

  it("retenção: 10 dias fica, 31 dias com janela 30 apaga e leva o histórico", () => {
    const recente = registrar(
      ORG_A,
      RUN_A2,
      "operacao.estoque_negativo|catalog_products|retencao",
    );

    sql(`
      update public.sentinel_occurrences
         set estado = 'corrigida',
             encerrada_em = now() - interval '10 days',
             updated_at = now() - interval '10 days'
       where id = '${recente}';
    `);

    // Dentro da janela (e acima do piso): não apaga.
    expect(Number(lastLine(sql(`select public.fn_sentinel_expurgar('${ORG_A}', 30);`)))).toBe(0);
    expect(
      Number(sql(`select count(*) from public.sentinel_occurrences where id = '${recente}';`)),
    ).toBe(1);

    // 31 dias com janela 30: apaga a ocorrência e o histórico em cascata.
    sql(`
      update public.sentinel_occurrences
         set encerrada_em = now() - interval '31 days',
             updated_at = now() - interval '31 days'
       where id = '${recente}';
    `);
    expect(
      Number(lastLine(sql(`select public.fn_sentinel_expurgar('${ORG_A}', 30);`))),
    ).toBeGreaterThanOrEqual(1);
    expect(
      Number(sql(`select count(*) from public.sentinel_occurrences where id = '${recente}';`)),
    ).toBe(0);
    expect(
      Number(sql(`select count(*) from public.sentinel_occurrence_events where occurrence_id = '${recente}';`)),
    ).toBe(0);
  });
});
