import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

import {
  alterarAgendamentoHandler,
  cancelarAgendamentoHandler,
} from "@/app/api/v1/agenda/agendamentos/_handler";
import { getContactHandler, patchContactHandler } from "@/app/api/v1/contacts/_handler";
import {
  getLeadHandler,
  listLeadsHandler,
  moveLeadHandler,
  updateLeadHandler,
} from "@/app/api/v1/leads/_handler";
import { listMessagesHandler } from "@/app/api/v1/messages/_handler";
import { listPipelinesHandler } from "@/app/api/v1/pipelines/_handler";
import type { HandlerCtx } from "@/lib/api/handlers/types";

import { pgComoSupabase } from "../pg-como-supabase";

/**
 * O AGENTE DE UMA ORGANIZAÇÃO NÃO ALCANÇA O NEGÓCIO DE OUTRA.
 *
 * ═══ POR QUE ESTE ARQUIVO EXISTE ═══
 *
 * O servidor MCP injeta `createAdminClient()` — service-role, que **bypassa
 * RLS** (lib/mcp/server.ts:39). O anti-pattern 10 do CLAUDE.md é exatamente
 * isto: "Service role bypassa RLS — handlers que usam admin client DEVEM
 * filtrar `organization_id` manualmente".
 *
 * As mesmas funções são chamadas por DOIS caminhos com garantias opostas:
 *
 *  - pela **rota HTTP**, com client de sessão — a RLS protege sozinha;
 *  - pelas **ferramentas do agente**, com service-role — **nada protege** além
 *    do filtro que o handler escrever à mão.
 *
 * Ler o código não basta para saber quais estão cobertos: contar menções de
 * `organization_id` num handler devolve 5 para uma função que não o usa em
 * filtro nenhum. Por isso aqui se mede COMPORTAMENTO — dois tenants de
 * verdade, e a tentativa de alcançar o recurso do vizinho.
 *
 * ═══ O QUE ESTE ARQUIVO COBRE (e por que cresceu) ═══
 *
 * A primeira versão media só os quatro handlers de lead. O MCP chama handlers
 * de SEIS módulos (`lib/mcp/tools/*`): leads, contatos, conversas/mensagens,
 * pipelines e agenda. Um gate estático por arquivo (`handlers-service-role-*`)
 * diz que a rota tem guard e menciona a organização — não diz que o HANDLER
 * compara a organização DO RECURSO com a do CHAMADOR. Foi exatamente essa
 * distância que deixou passar o envio cross-tenant de `sendMessageHandler`
 * (corrigido em `messages/_handler.ts`, com teste unitário próprio porque o
 * caminho toca o adapter de canal).
 *
 * `pgComoSupabase` conecta como `postgres`, então NÃO há RLS neste teste. É
 * deliberado: é assim que o service-role vê o banco, e é o cenário que precisa
 * ser barrado pelo próprio handler.
 */
const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db` (scripts/test-db.sh)");
}

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`,
  max: 3,
});
const db = pgComoSupabase(pool);

/** A organização do agente que está agindo. */
const ORG_A = "c205e700-0000-4000-8000-00000000000a";
/** A vítima: outra organização, com um negócio dela. */
const ORG_B = "c205e700-0000-4000-8000-00000000000b";

const CONTACT_A = "c205e700-3333-4000-8000-00000000000a";
const CONTACT_B = "c205e700-3333-4000-8000-00000000000b";
const CONV_B = "c205e700-4444-4000-8000-00000000000b";
const CONV_A = "c205e700-4444-4000-8000-00000000000a";
const EVENT_TYPE_A = "c205e700-5555-4000-8000-00000000000a";
const EVENT_TYPE_B = "c205e700-5555-4000-8000-00000000000b";
const APPOINTMENT_A = "c205e700-6666-4000-8000-00000000000a";
const APPOINTMENT_B = "c205e700-6666-4000-8000-00000000000b";

let leadDaVitima = "";
let stageDaVitima = "";
let pipelineDaVitima = "";

function ctxDoAgenteDeA(): HandlerCtx {
  return {
    organization_id: ORG_A,
    // O ator é o agente, como o MCP monta.
    actor: { type: "ai_agent", id: "run-de-a", role: "agent" },
    requestId: "req-cross-tenant",
  };
}

async function semearOrg(id: string, slug: string): Promise<{ pipeline: string; stage: string }> {
  await pool.query(
    `insert into organizations (id, slug, legal_name, display_name)
     values ($1, $2, 'Cross LTDA', 'Cross') on conflict (id) do nothing`,
    [id, slug],
  );
  const { rows: p } = await pool.query<{ id: string }>(
    `insert into crm_pipelines (organization_id, name, slug, position)
     values ($1, 'Funil ' || $2, 'funil-' || $2, 100) returning id`,
    [id, slug],
  );
  const { rows: s } = await pool.query<{ id: string }>(
    `insert into crm_stages (organization_id, pipeline_id, name, slug, position)
     values ($1, $2, 'Etapa', 'etapa-' || $3, 1) returning id`,
    [id, p[0]!.id, slug],
  );
  return { pipeline: p[0]!.id, stage: s[0]!.id };
}

/** Canal + contato + conversa + mensagem, com o id que o caso vai tentar alcançar. */
async function semearConversa(org: string, contactId: string, convId: string, tag: string) {
  await pool.query(
    `insert into channel_sessions (organization_id, waha_session_name, webhook_secret_encrypted)
     values ($1, $2, '\\x00'::bytea)`,
    [org, `cross-${tag}`],
  );
  await pool.query(
    `insert into contacts (id, organization_id, display_name, name)
     values ($1, $2, $3, $3)`,
    [contactId, org, `Contato ${tag}`],
  );
  const { rows: sess } = await pool.query<{ id: string }>(
    `select id from channel_sessions where organization_id = $1 limit 1`,
    [org],
  );
  await pool.query(
    `insert into conversations (id, organization_id, contact_id, channel_session_id)
     values ($1, $2, $3, $4)`,
    [convId, org, contactId, sess[0]!.id],
  );
  await pool.query(
    `insert into messages (organization_id, conversation_id, channel_session_id, contact_id, type, direction, body)
     values ($1, $2, $3, $4, 'text', 'inbound', $5)`,
    [org, convId, sess[0]!.id, contactId, `mensagem secreta de ${tag}`],
  );
}

async function semearAgenda(org: string, eventTypeId: string, appointmentId: string, tag: string) {
  await pool.query(
    `insert into calendar_event_types
       (id, organization_id, name, slug, category, duration_minutes, location_kind, position)
     values ($1, $2, $3, $4, 'visita', 30, 'in_person', 1)`,
    [eventTypeId, org, `Visita ${tag}`, `visita-${tag}`],
  );
  await pool.query(
    `insert into calendar_appointments
       (id, organization_id, event_type_id, title, starts_at, ends_at, time_zone, notes)
     values ($1, $2, $3, $4, now() + interval '2 days', now() + interval '2 days' + interval '30 min',
             'America/Sao_Paulo', 'nota original')`,
    [appointmentId, org, eventTypeId, `Compromisso ${tag}`],
  );
}

beforeAll(async () => {
  const a = await semearOrg(ORG_A, "cross-a");
  const b = await semearOrg(ORG_B, "cross-b");
  stageDaVitima = b.stage;
  pipelineDaVitima = b.pipeline;

  const { rows } = await pool.query<{ id: string }>(
    `insert into crm_leads (organization_id, pipeline_id, stage_id, title)
     values ($1, $2, $3, 'Negócio SECRETO da vítima') returning id`,
    [ORG_B, b.pipeline, b.stage],
  );
  leadDaVitima = rows[0]!.id;

  // A org do agente também tem um negócio — senão a listagem devolveria vazio
  // por não haver nada, e "não vazou" passaria sem medir nada.
  await pool.query(
    `insert into crm_leads (organization_id, pipeline_id, stage_id, title)
     values ($1, $2, $3, 'Negócio legítimo de A')`,
    [ORG_A, a.pipeline, a.stage],
  );

  await semearConversa(ORG_A, CONTACT_A, CONV_A, "a");
  await semearConversa(ORG_B, CONTACT_B, CONV_B, "b");
  await semearAgenda(ORG_A, EVENT_TYPE_A, APPOINTMENT_A, "a");
  await semearAgenda(ORG_B, EVENT_TYPE_B, APPOINTMENT_B, "b");
});

afterAll(async () => {
  await pool.query("delete from organizations where id = any($1)", [[ORG_A, ORG_B]]);
  await pool.end();
});

describe("o negócio da outra organização", () => {
  it("o cenário está montado — sem isto, os casos abaixo medem o vazio", async () => {
    // Controle positivo: o lead da vítima precisa existir e ser de ORG_B. Um
    // erro de setup faria todo "não alcançou" passar por ausência de alvo.
    const { rows } = await pool.query<{ organization_id: string; title: string }>(
      "select organization_id, title from crm_leads where id = $1",
      [leadDaVitima],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.organization_id).toBe(ORG_B);
  });

  it("NÃO é legível por `crm_get_lead`", async () => {
    // Estrito: ou lança, ou devolve null. A versão anterior aceitava "se veio
    // algo, que não seja da org B" — um retorno de qualquer outra coisa passava.
    const lead = await getLeadHandler(db, ctxDoAgenteDeA(), leadDaVitima).catch(() => null);
    expect(lead, "o agente de A recebeu o negócio de B em crm_get_lead").toBeNull();
  });

  it("a listagem RODA — sem isto, o caso abaixo passa com uma lista vazia por ERRO", async () => {
    // ⚠️ Controle positivo, e ele já pegou um falso verde MEU: a primeira versão
    // deste arquivo envolvia a chamada em `.catch(() => null)` e lia
    // `?.data ?? []`. Qualquer exceção — inclusive um método que o adaptador não
    // tem — virava lista vazia, e "não contém o lead da vítima" passava sem que
    // a listagem tivesse rodado. Aqui ela roda SEM rede: se estourar, o teste
    // morre dizendo isso, em vez de mentir verde.
    const r = await listLeadsHandler(db, ctxDoAgenteDeA(), {} as never);
    // ⚠️ O campo é `leads`, não `data` — e ler o nome errado era a SEGUNDA
    // metade do falso verde: `?.data ?? []` devolvia lista vazia mesmo quando
    // a listagem trazia o negócio da vítima. Duas camadas de mentira num caso só.
    expect(Array.isArray(r.leads), "a listagem precisa devolver uma lista").toBe(true);

    // E precisa haver O QUE listar na org do agente: uma lista vazia porque a
    // org de A não tem nada também passaria sem medir.
    const daPropriaOrg = r.leads.filter(
      (x) => (x as { organization_id?: string }).organization_id === ORG_A,
    );
    expect(daPropriaOrg.length, "a org do agente precisa ter lead para a listagem significar algo").toBeGreaterThan(0);
  });

  it("NÃO aparece em `crm_list_leads`", async () => {
    const r = await listLeadsHandler(db, ctxDoAgenteDeA(), {} as never);
    expect(
      r.leads.map((x) => (x as { id: string }).id),
      "a lista do agente de A trouxe o negócio de B",
    ).not.toContain(leadDaVitima);
  });

  it("NÃO é editável por `crm_update_lead` — e o título prova", async () => {
    // A prova é o ESTADO depois, não o retorno: um handler pode lançar DEPOIS
    // de escrever, e aí o "erro" esconderia a escrita que já aconteceu.
    await updateLeadHandler(db, ctxDoAgenteDeA(), leadDaVitima, {
      title: "INVADIDO pelo agente de outra organização",
    } as never).catch(() => null);

    const { rows } = await pool.query<{ title: string }>(
      "select title from crm_leads where id = $1",
      [leadDaVitima],
    );
    expect(rows[0]!.title, "o agente de A reescreveu o negócio de B").toBe(
      "Negócio SECRETO da vítima",
    );
  });

  it("NÃO é movível por `crm_move_lead_stage`", async () => {
    const { rows: antes } = await pool.query<{ stage_id: string }>(
      "select stage_id from crm_leads where id = $1",
      [leadDaVitima],
    );
    await moveLeadHandler(db, ctxDoAgenteDeA(), leadDaVitima, {
      to_stage_id: stageDaVitima,
    } as never).catch(() => null);
    const { rows: depois } = await pool.query<{ stage_id: string }>(
      "select stage_id from crm_leads where id = $1",
      [leadDaVitima],
    );
    expect(depois[0]!.stage_id).toBe(antes[0]!.stage_id);
  });
});

describe("o contato da outra organização (`crm_get_contact` / patch)", () => {
  it("NÃO é legível por `getContactHandler` — e o da própria org É (controle positivo)", async () => {
    await expect(
      getContactHandler(db, ctxDoAgenteDeA(), { contactId: CONTACT_B }),
      "crm_get_contact devolveu o contato de B",
    ).rejects.toMatchObject({ status: 404 });

    const proprio = await getContactHandler(db, ctxDoAgenteDeA(), { contactId: CONTACT_A });
    expect(proprio.id).toBe(CONTACT_A);
  });

  it("NÃO é editável por `patchContactHandler` — o nome de B continua o mesmo", async () => {
    // O handler é chamado com service role pelo caminho HTTP só quando há admin
    // client (cifra/segredo); pelo MCP, contatos usam get/list. A guarda existe
    // porque a função é genérica: o par leitura+escrita precisa filtrar a org
    // nas DUAS pontas, como `updateLeadHandler` faz.
    await patchContactHandler(db, ctxDoAgenteDeA(), CONTACT_B, {
      name: "INVADIDO",
    } as never).catch(() => null);

    const { rows } = await pool.query<{ name: string }>(
      "select name from contacts where id = $1",
      [CONTACT_B],
    );
    expect(rows[0]!.name, "o agente de A reescreveu o contato de B").toBe("Contato b");
  });

  it("edita o da própria org (controle positivo do patch)", async () => {
    await patchContactHandler(db, ctxDoAgenteDeA(), CONTACT_A, {
      name: "Editado pela própria org",
    } as never);
    const { rows } = await pool.query<{ name: string }>(
      "select name from contacts where id = $1",
      [CONTACT_A],
    );
    expect(rows[0]!.name).toBe("Editado pela própria org");
  });
});

describe("a conversa da outra organização (`crm_list_messages`)", () => {
  it("a listagem RODA na própria conversa (controle positivo)", async () => {
    const r = await listMessagesHandler(db, ctxDoAgenteDeA(), CONV_A, { limit: 50 } as never);
    expect(
      r.messages.map((m) => (m as { body?: string }).body),
      "a conversa da própria org precisa devolver a mensagem semeada",
    ).toContain("mensagem secreta de a");
  });

  it("NÃO devolve mensagem da conversa de B para o agente de A", async () => {
    // O segundo filtro da consulta (`organization_id`) é o que barra aqui: o
    // `conversation_id` de B é conhecido e o client é service-role.
    const r = await listMessagesHandler(db, ctxDoAgenteDeA(), CONV_B, { limit: 50 } as never);
    expect(r.messages).toEqual([]);
  });
});

describe("o funil da outra organização (`crm_list_pipelines`)", () => {
  it("a listagem não traz o funil de B e traz o de A (controle positivo)", async () => {
    const r = await listPipelinesHandler(db, ctxDoAgenteDeA(), {});
    const ids = r.pipelines.map((p) => p.id);
    expect(ids, "a lista de funis do agente de A trouxe o funil de B").not.toContain(
      pipelineDaVitima,
    );
    expect(ids.length, "a org de A precisa ter funil para a lista significar algo").toBeGreaterThan(0);
  });
});

describe("o compromisso da outra organização (`crm_*_appointment`)", () => {
  it("NÃO é alterável — e a nota de B prova", async () => {
    await alterarAgendamentoHandler(db, ctxDoAgenteDeA(), {
      id: APPOINTMENT_B,
      notes: "INVADIDO",
    } as never).catch(() => null);

    const { rows } = await pool.query<{ notes: string }>(
      "select notes from calendar_appointments where id = $1",
      [APPOINTMENT_B],
    );
    expect(rows[0]!.notes, "o agente de A reescreveu o compromisso de B").toBe("nota original");
  });

  it("NÃO é cancelável — o status de B continua o mesmo", async () => {
    const { rows: antes } = await pool.query<{ status: string }>(
      "select status from calendar_appointments where id = $1",
      [APPOINTMENT_B],
    );
    await cancelarAgendamentoHandler(db, ctxDoAgenteDeA(), {
      id: APPOINTMENT_B,
      reason: "INVADIDO",
    } as never).catch(() => null);

    const { rows: depois } = await pool.query<{ status: string }>(
      "select status from calendar_appointments where id = $1",
      [APPOINTMENT_B],
    );
    expect(depois[0]!.status).toBe(antes[0]!.status);
  });

  it("altera o da própria org (controle positivo)", async () => {
    await alterarAgendamentoHandler(db, ctxDoAgenteDeA(), {
      id: APPOINTMENT_A,
      notes: "nota alterada pela própria org",
    } as never);
    const { rows } = await pool.query<{ notes: string }>(
      "select notes from calendar_appointments where id = $1",
      [APPOINTMENT_A],
    );
    expect(rows[0]!.notes).toBe("nota alterada pela própria org");
  });
});
