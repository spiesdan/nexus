/**
 * Mede o scan do Sentinel com volume realista — e prova o orçamento de detecção.
 *
 * Uso (LOCAL, explícito, com o Supabase de pé):
 *
 *   set -a; . ./.env.e2e; set +a
 *   SENTINEL_CARGA_OK=1 pnpm exec tsx scripts/medir-sentinel-carga.ts
 *
 * O script SÓ roda contra loopback (`destinoEhLocal`) e exige
 * `SENTINEL_CARGA_OK=1`: semear 50k pedidos + 200k mensagens numa base não é
 * algo que um comando sem intenção deva fazer. Tudo é removido no `finally`.
 *
 * O scan lê 500 pedidos (teto da coleta), não 50k — o volume serve para medir
 * as CONSULTAS sob carga realista. A detecção é in-memory; o número que importa
 * é `deteccao_ms` e o `truncadoPorTempo`. Para provar que o teto trunca, o
 * mesmo snapshot é reprocessado com `orcamentoMs = 0`.
 */
import { Pool } from "pg";

import { executarSentinela } from "@/lib/sentinel/execucao";
import { coletarSnapshot } from "@/lib/sentinel/coleta";
import { executarDetectores } from "@/lib/sentinel/motor";
import { destinoEhLocal } from "@/scripts/lib/env-de-teste";

const PEDIDOS = Number(process.env.SENTINEL_CARGA_PEDIDOS ?? 50_000);
const MENSAGENS = Number(process.env.SENTINEL_CARGA_MENSAGENS ?? 200_000);
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const DB = process.env.SUPABASE_DB_URL ?? "";

if (process.env.SENTINEL_CARGA_OK !== "1") {
  throw new Error("Defina SENTINEL_CARGA_OK=1 para semear/medir; é carga, não rotina.");
}
if (!destinoEhLocal(URL) || !destinoEhLocal(DB)) {
  throw new Error(`Recusado: carga só em loopback (URL=${URL}).`);
}

const pool = new Pool({ connectionString: DB, max: 2 });
let execucaoMedida: string | null = null;

async function orgEContexto(): Promise<{
  orgId: string;
  contactId: string;
  sessionId: string;
  conversationId: string;
}> {
  const { rows } = await pool.query<{ id: string }>(
    `select id from public.organizations where slug = 'e2e-test-org' limit 1`,
  );
  const orgId = rows[0]?.id;
  if (!orgId) throw new Error("org e2e-test-org não encontrada — rode o seed de credenciais");

  const contato = await pool.query<{ id: string }>(
    `select id from public.contacts where organization_id = $1 limit 1`,
    [orgId],
  );
  let contactId = contato.rows[0]?.id;
  if (!contactId) {
    const novo = await pool.query<{ id: string }>(
      `insert into public.contacts (organization_id, name) values ($1, 'Carga Sentinel') returning id`,
      [orgId],
    );
    contactId = novo.rows[0]!.id;
  }

  const sessao = await pool.query<{ id: string }>(
    `select id from public.channel_sessions where organization_id = $1 limit 1`,
    [orgId],
  );
  let sessionId = sessao.rows[0]?.id;
  if (!sessionId) {
    const nova = await pool.query<{ id: string }>(
      `insert into public.channel_sessions
         (organization_id, waha_session_name, webhook_secret_encrypted, status)
       values ($1, 'carga-sentinel', '\\x00'::bytea, 'WORKING') returning id`,
      [orgId],
    );
    sessionId = nova.rows[0]!.id;
  }

  const conversa = await pool.query<{ id: string }>(
    `select id from public.conversations where organization_id = $1 limit 1`,
    [orgId],
  );
  let conversationId = conversa.rows[0]?.id;
  if (!conversationId) {
    const nova = await pool.query<{ id: string }>(
      `insert into public.conversations (organization_id, contact_id, channel_session_id)
       values ($1, $2, $3) returning id`,
      [orgId, contactId, sessionId],
    );
    conversationId = nova.rows[0]!.id;
  }

  return { orgId, contactId, sessionId, conversationId };
}

async function semear(ctx: Awaited<ReturnType<typeof orgEContexto>>): Promise<void> {
  const inicio = Date.now();
  await pool.query("begin");
  // Sem triggers/auditoria por linha: é carga sintética com FKs válidas.
  await pool.query("set local session_replication_role = replica");

  await pool.query(
    `delete from public.messages where organization_id = $1 and external_id like 'carga-sentinel-%'`,
    [ctx.orgId],
  );
  await pool.query(
    `delete from public.commercial_orders
      where organization_id = $1 and numero between 9000000 and $2`,
    [ctx.orgId, 9000000 + PEDIDOS],
  );

  await pool.query(
    `insert into public.commercial_orders
       (organization_id, numero, contact_id, cliente_nome, status, subtotal_cents,
        desconto_cents, frete_cents, total_cents, created_at, updated_at)
     select $1, 9000000 + g, $2, 'Carga Sentinel', 'faturado', 1000, 0, 0, 1000,
            now() - (g || ' seconds')::interval, now()
       from generate_series(1, $3) g`,
    [ctx.orgId, ctx.contactId, PEDIDOS],
  );

  await pool.query(
    `insert into public.messages
       (organization_id, conversation_id, channel_session_id, contact_id, external_id,
        type, direction, status, body, sent_via, created_at, updated_at)
     select $1, $2, $3, $4, 'carga-sentinel-' || g, 'text', 'inbound', 'received',
            'carga', 'crm', now() - (g || ' seconds')::interval, now()
       from generate_series(1, $5) g`,
    [ctx.orgId, ctx.conversationId, ctx.sessionId, ctx.contactId, MENSAGENS],
  );

  await pool.query("commit");
  process.stdout.write(
    `seed: ${PEDIDOS} pedidos + ${MENSAGENS} mensagens em ${Date.now() - inicio} ms\n`,
  );
}

async function limpar(ctx: Awaited<ReturnType<typeof orgEContexto>>): Promise<void> {
  const inicio = Date.now();
  await pool.query(
    `delete from public.messages where organization_id = $1 and external_id like 'carga-sentinel-%'`,
    [ctx.orgId],
  );
  await pool.query(
    `delete from public.commercial_orders
      where organization_id = $1 and numero between 9000000 and $2`,
    [ctx.orgId, 9000000 + PEDIDOS],
  );
  if (execucaoMedida) {
    // Só as ocorrências criadas por ESTA rodada; o resto da base de teste fica.
    await pool.query(
      `delete from public.sentinel_occurrences where organization_id = $1 and ultima_execucao_id = $2`,
      [ctx.orgId, execucaoMedida],
    );
    await pool.query(`delete from public.sentinel_runs where id = $1`, [execucaoMedida]);
  }
  process.stdout.write(`limpeza em ${Date.now() - inicio} ms\n`);
}

async function main(): Promise<void> {
  const ctx = await orgEContexto();
  try {
    await semear(ctx);

    const inicio = Date.now();
    const scan = await executarSentinela({
      organizationId: ctx.orgId,
      origem: "manual",
      usuarioId: null,
    });
    execucaoMedida = scan.execucaoId;
    const totalMs = Date.now() - inicio;
    process.stdout.write(
      `scan: ${JSON.stringify({
        total_ms: totalMs,
        status: scan.status,
        achados: scan.achados,
        criadas: scan.criadas,
        reafirmadas: scan.reafirmadas,
        encerradas: scan.encerradas,
        truncado: scan.truncado,
        execucao_id: scan.execucaoId,
      })}\n`,
    );

    if (scan.execucaoId) {
      const run = await pool.query<{ duracao_ms: number; detalhe: Record<string, unknown> }>(
        `select duracao_ms, detalhe from public.sentinel_runs where id = $1`,
        [scan.execucaoId],
      );
      process.stdout.write(`run: ${JSON.stringify(run.rows[0] ?? null)}\n`);
    }

    const coleta = await coletarSnapshot(ctx.orgId);
    const forcado = executarDetectores(coleta.snapshot, { orcamentoMs: 0 });
    process.stdout.write(
      `deteccao_forcada_0ms: ${JSON.stringify({
        tempo_ms: forcado.tempoMs,
        truncado_por_tempo: forcado.truncadoPorTempo,
        regras_avaliadas: forcado.regrasAvaliadas.length,
        achados: forcado.achados.length,
      })}\n`,
    );

    const normal = executarDetectores(coleta.snapshot);
    process.stdout.write(
      `deteccao_normal: ${JSON.stringify({
        tempo_ms: normal.tempoMs,
        truncado_por_tempo: normal.truncadoPorTempo,
        regras_avaliadas: normal.regrasAvaliadas.length,
      })}\n`,
    );
  } finally {
    await limpar(ctx);
    await pool.end();
  }
}

main().catch(async (erro) => {
  await pool.end().catch(() => undefined);
  process.stderr.write(`${erro instanceof Error ? erro.stack : String(erro)}\n`);
  process.exit(1);
});
