import { beforeAll, describe, expect, it } from "vitest";

import { lastLine, sql } from "./gov-helpers";

/**
 * A correção aprovada da v1.3, provada no BANCO:
 *
 *  - antecipa `run_after` de job watchdog pending atrasado e grava ocorrência
 *    `corrigida` + evento `nota` com antes/depois na MESMA transação;
 *  - reverter restaura o `run_after` anterior e reabre a ocorrência;
 *  - depois que o worker "reclama" (status running), a reversão devolve zero
 *    linhas — não finge desfazer;
 *  - job de outro tipo, outra org, outra regra ou ocorrência não aprovada são
 *    recusa dura: zero linhas, nada muda.
 */

const ORG_A = "a0250000-0000-4000-8000-000000000001";
const ORG_B = "b0250000-0000-4000-8000-000000000002";
const USER_A = "a0250000-1111-4000-8000-000000000001";

const OCC_OK = "a0250000-2222-4000-8000-000000000001";
const JOB_OK = "a0250000-3333-4000-8000-000000000001";

const OCC_RUNNING = "a0250000-2222-4000-8000-000000000002";
const JOB_RUNNING = "a0250000-3333-4000-8000-000000000002";

const OCC_FLYWHEEL = "a0250000-2222-4000-8000-000000000003";
const JOB_FLYWHEEL = "a0250000-3333-4000-8000-000000000003";

const OCC_NAO_APROVADA = "a0250000-2222-4000-8000-000000000004";
const JOB_NAO_APROVADA = "a0250000-3333-4000-8000-000000000004";

const OCC_B = "b0250000-2222-4000-8000-000000000005";
const JOB_B = "b0250000-3333-4000-8000-000000000005";

function ocorrencia(id: string, org: string, job: string, estado: string, fp: string): string {
  return `
    insert into public.sentinel_occurrences
      (id, organization_id, fingerprint, regra, categoria, entidade_tipo, entidade_id,
       titulo, resumo, causa_provavel, severidade, estado)
    values
      ('${id}', '${org}', '${fp}', 'operacao.job_fila_travado', 'operacao', 'job_queue',
       '${job}', 'Job na dead-letter', 'Job parado.', 'Worker parado.', 'alta', '${estado}')
    on conflict (id) do nothing;
  `;
}

function job(
  id: string,
  org: string,
  kind: string,
  status: string,
  attempts: number,
  maxAttempts: number,
): string {
  return `
    insert into public.job_queue
      (id, organization_id, kind, status, attempts, max_attempts, run_after)
    values
      ('${id}', '${org}', '${kind}', '${status}', ${attempts}, ${maxAttempts},
       now() - interval '3 hours')
    on conflict (id) do nothing;
  `;
}

function corrigir(org: string, occ: string, job: string): number {
  return Number(
    lastLine(
      sql(`
        select count(*) from public.fn_sentinel_corrigir_job(
          '${org}', '${occ}', '${USER_A}',
          (select run_after from public.job_queue where id = '${job}'),
          now()
        );
      `),
    ),
  );
}

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${USER_A}', 'correcao-sentinel@invariant.test')
      on conflict (id) do nothing;

    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'correcao-a', 'Correção A', 'Correção A'),
      ('${ORG_B}', 'correcao-b', 'Correção B', 'Correção B')
      on conflict (id) do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${USER_A}', '${ORG_A}', 'manager', now())
      on conflict do nothing;

    ${job(JOB_OK, ORG_A, "watchdog", "pending", 1, 5)}
    ${ocorrencia(OCC_OK, ORG_A, JOB_OK, "aprovada", "fp-correcao-ok")}

    ${job(JOB_RUNNING, ORG_A, "watchdog", "running", 1, 5)}
    ${ocorrencia(OCC_RUNNING, ORG_A, JOB_RUNNING, "aprovada", "fp-correcao-running")}

    ${job(JOB_FLYWHEEL, ORG_A, "flywheel", "pending", 1, 5)}
    ${ocorrencia(OCC_FLYWHEEL, ORG_A, JOB_FLYWHEEL, "aprovada", "fp-correcao-flywheel")}

    ${job(JOB_NAO_APROVADA, ORG_A, "watchdog", "pending", 1, 5)}
    ${ocorrencia(OCC_NAO_APROVADA, ORG_A, JOB_NAO_APROVADA, "investigando", "fp-correcao-nao-aprovada")}

    ${job(JOB_B, ORG_B, "watchdog", "pending", 1, 5)}
    ${ocorrencia(OCC_B, ORG_B, JOB_B, "aprovada", "fp-correcao-b")}
  `);
});

describe("Sentinel — correção aprovada de job (0325)", () => {
  it("antecipa o job, fecha a ocorrência e grava o antes/depois no histórico", () => {
    expect(corrigir(ORG_A, OCC_OK, JOB_OK)).toBe(1);

    expect(
      sql(`select status from public.job_queue where id = '${JOB_OK}';`),
    ).toBe("pending");
    expect(
      Number(
        lastLine(
          sql(`select count(*) from public.job_queue where id = '${JOB_OK}' and run_after > now() - interval '1 minute';`),
        ),
      ),
    ).toBe(1);
    expect(
      sql(`select estado from public.sentinel_occurrences where id = '${OCC_OK}';`),
    ).toBe("corrigida");
    expect(
      sql(`select tipo || ':' || coalesce(detalhe->>'correcao','—') from public.sentinel_occurrence_events where occurrence_id = '${OCC_OK}' order by created_at desc limit 1;`),
    ).toBe("nota:antecipar_job");
    expect(
      Number(
        lastLine(
          sql(`select count(*) from public.sentinel_occurrence_events where occurrence_id = '${OCC_OK}' and (detalhe->>'run_after_antes')::timestamptz < now() - interval '2 hours';`),
        ),
      ),
    ).toBe(1);
  });

  it("reverte enquanto o job segue pendente e restaura o run_after anterior", () => {
    const restaurado = Number(
      lastLine(
        sql(`
          select count(*) from public.fn_sentinel_reverter_job('${ORG_A}', '${OCC_OK}', '${USER_A}');
        `),
      ),
    );
    expect(restaurado).toBe(1);
    expect(
      Number(
        lastLine(
          sql(`select count(*) from public.job_queue where id = '${JOB_OK}' and run_after < now() - interval '2 hours';`),
        ),
      ),
    ).toBe(1);
    expect(
      sql(`select estado from public.sentinel_occurrences where id = '${OCC_OK}';`),
    ).toBe("nova");
    expect(
      sql(`select tipo from public.sentinel_occurrence_events where occurrence_id = '${OCC_OK}' order by created_at desc limit 1;`),
    ).toBe("reaberta");
  });

  it("depois de reclamado, reverter devolve zero linhas e NÃO reabre", () => {
    // A ocorrência OK voltou para `nova` na reversão; aprova de novo e corrige,
    // depois simula o worker reclamando o job.
    sql(`update public.sentinel_occurrences set estado = 'aprovada' where id = '${OCC_OK}';`);
    expect(corrigir(ORG_A, OCC_OK, JOB_OK)).toBe(1);
    sql(`update public.job_queue set status = 'running' where id = '${JOB_OK}';`);

    const reverteu = Number(
      lastLine(
        sql(`select count(*) from public.fn_sentinel_reverter_job('${ORG_A}', '${OCC_OK}', '${USER_A}');`),
      ),
    );
    expect(reverteu).toBe(0);
    expect(
      sql(`select estado from public.sentinel_occurrences where id = '${OCC_OK}';`),
    ).toBe("corrigida");
    expect(
      sql(`select status from public.job_queue where id = '${JOB_OK}';`),
    ).toBe("running");
  });

  it("recusa job running, flywheel, ocorrência não aprovada e outra organização", () => {
    expect(corrigir(ORG_A, OCC_RUNNING, JOB_RUNNING)).toBe(0);
    expect(corrigir(ORG_A, OCC_FLYWHEEL, JOB_FLYWHEEL)).toBe(0);
    expect(corrigir(ORG_A, OCC_NAO_APROVADA, JOB_NAO_APROVADA)).toBe(0);
    expect(corrigir(ORG_A, OCC_B, JOB_B)).toBe(0);

    expect(
      sql(`select status from public.job_queue where id = '${JOB_RUNNING}';`),
    ).toBe("running");
    expect(
      sql(`select status from public.job_queue where id = '${JOB_FLYWHEEL}';`),
    ).toBe("pending");
    expect(
      sql(`select estado from public.sentinel_occurrences where id = '${OCC_NAO_APROVADA}';`),
    ).toBe("investigando");
    expect(
      sql(`select estado from public.sentinel_occurrences where id = '${OCC_B}';`),
    ).toBe("aprovada");
  });
});
