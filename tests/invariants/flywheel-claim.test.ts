import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { liberarTurno, reservarTurno, turnosParaJulgar } from "@/lib/agent-engine/flywheel/live";
import { sql } from "./gov-helpers";

/**
 * P1-9 — flywheel sem claim.
 *
 * A unique `(dataset, trace_id, dimension)` impedia **veredito** duplicado, mas
 * cada réplica pagava a chamada de LLM antes de descobrir isso: duas réplicas a
 * cada 6 h julgavam os mesmos turnos e só uma gravava — custo de IA dobrado.
 *
 * Aqui se prova, contra Postgres de verdade:
 *   1. o lote NÃO inclui turno que já tem veredito (o filtro `not exists`);
 *   2. o claim é de UMA réplica: a segunda recebe `false` e não paga o LLM;
 *   3. soltar o claim devolve o turno (o lock não fica preso).
 */

const PORTA = Number(process.env.TEST_DB_PORT ?? 54329);
const ORG = "aaaaaaaa-0000-4000-8000-0000000000f1";
const CONTATO = "aaaaaaaa-1111-4000-8000-0000000000f1";
const JOB_JULGADO = "aaaaaaaa-2222-4000-8000-0000000000f1";
const JOB_NOVO = "aaaaaaaa-3333-4000-8000-0000000000f1";

let pool: Pool;

beforeAll(async () => {
  pool = new Pool({
    host: "127.0.0.1",
    port: PORTA,
    user: "postgres",
    password: "postgres",
    database: "postgres",
    max: 4,
  });

  sql(`
    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${ORG}', 'flywheel-claim', 'Flywheel Claim', 'Flywheel Claim')
      on conflict do nothing;
    insert into public.contacts (id, organization_id, display_name)
      values ('${CONTATO}', '${ORG}', 'Contato Flywheel')
      on conflict do nothing;
    insert into public.job_queue (id, organization_id, contact_id, kind, status)
      values
        ('${JOB_JULGADO}', '${ORG}', '${CONTATO}', 'inbound_turn', 'done'),
        ('${JOB_NOVO}', '${ORG}', '${CONTATO}', 'inbound_turn', 'done')
      on conflict do nothing;
    insert into public.llm_calls (organization_id, job_id, purpose, provider, model, status)
      values
        ('${ORG}', '${JOB_JULGADO}', 'agent_turn', 'anthropic', 'haiku', 'ok'),
        ('${ORG}', '${JOB_NOVO}', 'agent_turn', 'anthropic', 'haiku', 'ok')
      on conflict do nothing;
    insert into public.flywheel_judge_verdicts
      (organization_id, dataset, trace_id, dimension, verdict, option_order, judge_family, model, run_id)
      values ('${ORG}', 'live', '${JOB_JULGADO}', 'memory_hygiene', 'yes', 'yes_first', 'anthropic', 'haiku', gen_random_uuid())
      on conflict (dataset, trace_id, dimension) do nothing;
  `);
});

afterAll(async () => {
  await pool?.end();
});

describe("flywheel — claim por turno", () => {
  it("o lote não traz turno que já tem veredito", async () => {
    const turnos = await turnosParaJulgar(pool, 50);
    const ids = turnos.map((t) => t.job_id);
    expect(ids).toContain(JOB_NOVO);
    expect(ids, "turno já julgado não pode voltar para o lote").not.toContain(JOB_JULGADO);
  });

  it("duas réplicas: só uma reserva o mesmo turno", async () => {
    const a = await pool.connect();
    const b = await pool.connect();
    try {
      expect(await reservarTurno(a, JOB_NOVO)).toBe(true);
      expect(await reservarTurno(b, JOB_NOVO), "a segunda réplica pularia o LLM").toBe(false);

      // Só o dono solta; depois disso o turno volta a ser reservável.
      await liberarTurno(a, JOB_NOVO);
      expect(await reservarTurno(b, JOB_NOVO)).toBe(true);
      await liberarTurno(b, JOB_NOVO);
    } finally {
      a.release();
      b.release();
    }
  });

  it("turnos diferentes não se bloqueiam", async () => {
    const a = await pool.connect();
    const b = await pool.connect();
    try {
      expect(await reservarTurno(a, JOB_NOVO)).toBe(true);
      expect(await reservarTurno(b, `${JOB_NOVO}-outro`)).toBe(true);
      await liberarTurno(a, JOB_NOVO);
      await liberarTurno(b, `${JOB_NOVO}-outro`);
    } finally {
      a.release();
      b.release();
    }
  });

  it("fechar a conexão solta o lock (o finally do run não deixa preso)", async () => {
    const a = await pool.connect();
    expect(await reservarTurno(a, JOB_NOVO)).toBe(true);
    a.release(true); // destroy: simula queda do worker no meio

    const b: PoolClient = await pool.connect();
    try {
      expect(await reservarTurno(b, JOB_NOVO)).toBe(true);
      await liberarTurno(b, JOB_NOVO);
    } finally {
      b.release();
    }
  });
});
