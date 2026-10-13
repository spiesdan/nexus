/**
 * POST /api/v1/prospecting/prospects/disparar — a MESMA mensagem para os
 * prospects escolhidos, com simulação por padrão.
 *
 * ═══ A REGRA DE OURO DESTA ROTA ═════════════════════════════════════════
 *
 * `dry_run` é `true` por padrão no schema. Quem envia tem que PEDIR o envio.
 * Não é cautela — é que o dano deste endpoint em particular não
 * aparece
 * como erro: o número é banido e ninguém vê nada.
 *
 * E a simulação não é enfeite. Ela responde as três perguntas que o operador
 * faz antes de mandar mil mensagens e que nenhuma tela mostra de outro jeito:
 *
 *   1. quantos vão sair — e quantos NÃO vão, e por quê (um por linha)
 *   2. quanto tempo vai levar, no ritmo configurado
 *   3. se dá para enviar AGORA — isto é, se há sessão de WhatsApp utilizável
 *
 * ═══ POR QUE A SIMULAÇÃO VÊ A SESSÃO, E O ENVIO NÃO PODE ESQUECER ════════
 *
 * Medido em 13/10/2026 na instalação do usuário: 6 `channel_sessions`, todas
 * em `STOPPED`, e a única real (`org_4bc721ce`) com `archived_at` preenchido.
 *
 * Nenhuma `WORKING` significa que o `sendMessageHandler` NÃO devolve erro:
 * ele insere a linha em `messages` com `status='queued'` e
 * `queued_reason='channel_session_not_working'`, e no caminho humano não há
 * quem reagende `queued` (o `recover-stuck-messages` só cobre `sending`).
 * "Enviar 500" viraria 500 linhas na fila para sempre, e a tela diria
 * "enviado". Por isso `podeEnviar` vem do PLANEJADOR e esta rota se recusa a
 * sair sem sessão WORKING — em vez de confiar que o handler avisa.
 */
import { randomUUID } from "node:crypto";

import { type NextRequest } from "next/server";

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { ApiError } from "@/lib/api/types";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { ensureConversation } from "@/lib/automation/start-conversation";
import { jitterMs } from "@/lib/automation/throttle";
import {
  ESPACO_PADRAO_MS,
  LIMITE_PADRAO_DIA,
  ROTULO_DA_RECUSA,
  planejarDisparo,
  validarMensagem,
  type CandidatoAoDisparo,
} from "@/lib/prospeccao/disparo";
import { validateRequest } from "@/lib/schemas";
import { disparoSchema } from "@/lib/schemas/prospeccao";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** Janela de "mensagem recente" — quem recebeu hoje não recebe de novo. */
const COOLDOWN_HORAS = 30;

/** Conversas que contam como "já tem conversa aberta". */
const STATUS_DE_CONVERSA_ABERTA = ["open", "pending", "claimed", "ai_handling"];

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  // spec 13 §4: enviar é agent+ (viewer é read-only).
  const authz = await requireRole("agent", { requestId, resource: "business_prospects" });
  if (!authz.ok) return authz.response;
  const orgId = authz.org.orgId;
  const usuarioId = authz.user.id;

  let entrada;
  try {
    entrada = await validateRequest(disparoSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }

  // A validação do texto é a do planejador — a mesma que o teste cobre, e a
  // mesma que a tela vai mostrar. Aqui é só para devolver 400 em vez de um
  // plano com 500 recusas de "mensagem vazia" (que não é um motivo de recusa
  // de ninguém).
  const texto = validarMensagem(entrada.mensagem);
  if (!texto.ok) return fail("validation_failed", texto.erro, 400, { requestId });

  const admin = createAdminClient();
  const limite = entrada.limite ?? LIMITE_PADRAO_DIA;
  const espacoMs = entrada.espaco_ms ?? ESPACO_PADRAO_MS;

  // ─── Sessão utilizável ───────────────────────────────────────────────────
  // `sessaoProntaParaEnvio` cai para uma sessão parada quando não há WORKING —
  // o que é o comportamento certo para ABRIR conversa e o comportamento errado
  // para prometer envio. Aqui a pergunta é "dá para mandar AGORA", e a resposta
  // é só `WORKING` não arquivada.
  const { data: sessoes, error: errSessao } = await admin
    .from("channel_sessions")
    .select("id, status, archived_at")
    .eq("organization_id", orgId)
    .eq("status", "WORKING")
    .is("archived_at", null)
    .limit(1);
  if (errSessao) return fail("internal_error", "Erro ao ler as sessões.", 500, { requestId });
  const sessao = (sessoes as Array<{ id: string }> | null)?.[0] ?? null;
  const sessaoWorking = sessao !== null;

  // ─── Prospects + contexto ────────────────────────────────────────────────
  const { data: linhas, error: errProspects } = await admin
    .from("business_prospects")
    .select(
      "id, nome, telefone_normalizado, do_not_contact, bloqueado, whatsapp_potencial, status_comercial, contact_id",
    )
    .eq("organization_id", orgId)
    .in("id", entrada.prospect_ids)
    .limit(2000);
  if (errProspects) return fail("internal_error", "Erro ao ler os prospects.", 500, { requestId });

  const brutos = (linhas ?? []) as Array<{
    id: string;
    nome: string | null;
    telefone_normalizado: string | null;
    do_not_contact: boolean;
    bloqueado: boolean;
    whatsapp_potencial: boolean;
    status_comercial: string;
    contact_id: string | null;
  }>;
  if (brutos.length === 0) {
    return fail("not_found", "Nenhum dos prospects pertence a esta organização.", 404, { requestId });
  }

  const contactIds = [...new Set(brutos.map((p) => p.contact_id).filter((c): c is string => !!c))];

  const porContato = await contextoDosContatos(admin, orgId, contactIds);

  // ─── Cota do dia ─────────────────────────────────────────────────────────
  // `pacing_ledger` é quem conta envio de verdade (o `channel_session_warmup`
  // não tem escritor — ver `lib/automation/throttle.ts`). Conta-se o dia
  // inteiro em UTC, que é o fuso que a coluna `sent_at` grava.
  let jaEnviadosHoje = 0;
  if (sessao) {
    const inicioDoDia = new Date();
    inicioDoDia.setUTCHours(0, 0, 0, 0);
    const { count, error: errCota } = await admin
      .from("pacing_ledger")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("channel_session_id", sessao.id)
      .gte("sent_at", inicioDoDia.toISOString());
    if (errCota) return fail("internal_error", "Erro ao ler a cota do dia.", 500, { requestId });
    jaEnviadosHoje = count ?? 0;
  }

  const candidatos: CandidatoAoDisparo[] = brutos.map((p) => {
    const ctx = p.contact_id ? porContato.get(p.contact_id) : undefined;
    return {
      id: p.id,
      nome: p.nome ?? "(sem nome)",
      telefone_normalizado: p.telefone_normalizado,
      do_not_contact: p.do_not_contact,
      bloqueado: p.bloqueado,
      whatsapp_potencial: p.whatsapp_potencial,
      status_comercial: p.status_comercial,
      contact_id: p.contact_id,
      contatoBloqueado: ctx?.is_blocked ?? false,
      consentRecusado: !!ctx?.declined_at,
      conversaAberta: ctx?.conversaAberta ?? false,
      mensagemRecente: ctx?.mensagemRecente ?? false,
    };
  });

  const plano = planejarDisparo(candidatos, {
    limite,
    jaEnviadosHoje,
    espacoMs,
    sessaoWorking,
  });

  const resumo = {
    simulacao: entrada.dry_run,
    pode_enviar: plano.podeEnviar,
    bloqueio: plano.bloqueio,
    selecionados: entrada.prospect_ids.length,
    encontrados: brutos.length,
    serao_enviados: plano.aprovados.length,
    serao_recusados: plano.recusados.length,
    estouraram_a_cota: plano.estouraramACota,
    ja_enviados_hoje: jaEnviadosHoje,
    limite,
    espaco_ms: espacoMs,
    duracao_prevista_ms: plano.duracaoPrevistaMs,
    por_motivo: contarPorMotivo(plano.recusados),
    // A lista vem com o NOME e o motivo, nunca com o telefone: a simulação é
    // uma tela, e telefone na tela de plano é um dado de contato à toa.
    recusas: plano.recusados.map((r) => ({ nome: r.nome, motivo: r.motivo })),
  };

  // ─── Simulação: responde e para ──────────────────────────────────────────
  if (entrada.dry_run) return ok({ plano: resumo }, { requestId });

  // ─── Sem sessão: NÃO É ERRO, É ESTADO ────────────────────────────────────
  // Devolve 409 com o plano inteiro. A tela mostra "2.141 prontos, mas não há
  // número conectado" — que é a verdade. Um 500 aqui seria esconder que o
  // operador só precisa escanear um QR Code.
  if (!plano.podeEnviar) {
    return fail(
      "conflict",
      "Não há sessão de WhatsApp conectada (WORKING). Nada foi enviado.",
      409,
      { requestId, details: { plano: resumo } },
    );
  }

  const resultado = await enviarPlano({
    admin,
    orgId,
    usuarioId,
    requestId,
    sessaoId: sessao!.id,
    espacoMs,
    mensagem: entrada.mensagem,
    plano,
  });

  return ok({ plano: resumo, resultado }, { requestId });
}

interface ContextoDoContato {
  is_blocked: boolean;
  declined_at: string | null;
  conversaAberta: boolean;
  mensagemRecente: boolean;
}

/**
 * O que o banco sabe sobre cada contato JÁ IMPORTADO: pediu para parar, recusou
 * o marketing, tem conversa aberta, recebeu mensagem há pouco.
 *
 * Prospect que nunca virou contato não tem linha aqui — e isso é o correto: um
 * contato novo não pode ter recusado nada nem ter conversa aberta.
 */
async function contextoDosContatos(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  contactIds: string[],
): Promise<Map<string, ContextoDoContato>> {
  const saida = new Map<string, ContextoDoContato>();
  if (contactIds.length === 0) return saida;

  const { data: contatos } = await admin
    .from("contacts")
    .select("id, is_blocked, consent")
    .eq("organization_id", orgId)
    .in("id", contactIds)
    .limit(2000);
  const linhas = (contatos ?? []) as Array<{
    id: string;
    is_blocked: boolean;
    consent: { marketing?: { declined_at?: string | null } | null } | null;
  }>;
  for (const c of linhas) {
    saida.set(c.id, {
      is_blocked: c.is_blocked,
      declined_at: c.consent?.marketing?.declined_at ?? null,
      conversaAberta: false,
      mensagemRecente: false,
    });
  }
  if (saida.size === 0) return saida;

  const { data: conversas } = await admin
    .from("conversations")
    .select("contact_id, status")
    .eq("organization_id", orgId)
    .in("contact_id", contactIds)
    .in("status", STATUS_DE_CONVERSA_ABERTA)
    .limit(5000);
  for (const cv of (conversas ?? []) as Array<{ contact_id: string | null }>) {
    if (!cv.contact_id) continue;
    const c = saida.get(cv.contact_id);
    if (c) c.conversaAberta = true;
  }

  const desde = new Date(Date.now() - COOLDOWN_HORAS * 3_600_000).toISOString();
  const { data: recentes } = await admin
    .from("messages")
    .select("contact_id")
    .eq("organization_id", orgId)
    .eq("direction", "outbound")
    .in("contact_id", contactIds)
    .gte("created_at", desde)
    .limit(5000);
  for (const m of (recentes ?? []) as Array<{ contact_id: string | null }>) {
    if (!m.contact_id) continue;
    const c = saida.get(m.contact_id);
    if (c) c.mensagemRecente = true;
  }

  return saida;
}

function contarPorMotivo(recusas: Array<{ motivo: keyof typeof ROTULO_DA_RECUSA }>) {
  const contagem: Record<string, number> = {};
  for (const r of recusas) contagem[r.motivo] = (contagem[r.motivo] ?? 0) + 1;
  // Rótulo junto: a tela nunca deve mostrar o código da chave.
  return Object.entries(contagem).map(([motivo, total]) => ({
    motivo,
    rotulo: ROTULO_DA_RECUSA[motivo as keyof typeof ROTULO_DA_RECUSA] ?? motivo,
    total,
  }));
}

/**
 * Espera entre dois envios — e o ritmo que o PLANO prometeu, mais jitter.
 *
 * Não reusa `espacarEnvio` de propósito: aquela usa
 * `AUTOMATED_SEND_SPACING_MS` fixo (1200ms) e não aceita outro valor. Se o
 * operador pedisse 5s na tela, o plano prometeria 50 × 5s = 4min e o envio
 * sairia em 1min — a simulação estaria mentindo sobre o tempo real, que é a
 * única coisa que ela existe para dizer.
 *
 * O jitter (0–800ms) é da automação e fica: intervalo fixo é assinatura de
 * robô.
 */
const _ultimoEnvio = new Map<string, number>();

async function esperar(sessionId: string, espacoMs: number): Promise<void> {
  const ultimo = _ultimoEnvio.get(sessionId) ?? 0;
  const alvo = ultimo + espacoMs + jitterMs();
  const faltam = alvo - Date.now();
  if (faltam > 0) await new Promise((r) => setTimeout(r, faltam));
  _ultimoEnvio.set(sessionId, Date.now());
}

interface ParamsDoEnvio {
  admin: ReturnType<typeof createAdminClient>;
  orgId: string;
  usuarioId: string;
  requestId: string;
  sessaoId: string;
  espacoMs: number;
  mensagem: string;
  plano: ReturnType<typeof planejarDisparo>;
}

/**
 * Executa o plano. Um por um, com o mesmo espaçamento da automação.
 *
 * Três decisões que valem o comentário:
 *
 * 1. **Um por um, sem `Promise.all`.** Mandar 500 de uma vez é o padrão que
 *    ban. O ritmo é o plano, e o plano é sequencial.
 * 2. **Falha de um não derruba os outros.** Um número rejeitado pelo canal não
 *    pode impedir a campanha inteira — quem manda em lote precisa do relatório
 *    do que deu errado, não de um 500 no meio.
 * 3. **O contato é resolvido por telefone.** O prospect pode não terido contato
 *    ainda: `fn_upsert_wa_contact` cria, e é o mesmo caminho que a entrada
 *    usa — não há segunda forma de "criar contato" neste produto.
 */
async function enviarPlano(p: ParamsDoEnvio) {
  const enviados: Array<{ nome: string; message_id: string; status: string }> = [];
  const falhas: Array<{ nome: string; erro: string }> = [];

  for (const item of p.plano.aprovados) {
    try {
      await esperar(p.sessaoId, p.espacoMs);

      const chatId = item.telefone_normalizado.replace(/\D/g, "");
      const { data: contactId, error: errContato } = await p.admin.rpc("fn_upsert_wa_contact", {
        p_org: p.orgId,
        p_kind: "phone",
        p_phone: chatId,
        p_lid: null,
        p_chat_id: chatId,
        // `p_notify` é o NOME DE EXIBIÇÃO (o "notify name" do WhatsApp), não
        // um booleano — a coluna é `text`. Mandar `true` faria o contato de
        // todo mundo se chamar "true" no CRM.
        p_notify: item.nome,
      });
      if (errContato || !contactId) {
        falhas.push({ nome: item.nome, erro: errContato?.message ?? "Não foi possível criar o contato." });
        continue;
      }

      // `ensureConversation` devolve sempre um id ou lança — o erro cai no
      // `catch` abaixo e vira uma linha de `falhas`, sem parar a campanha.
      const conversationId = await ensureConversation(p.admin, p.orgId, contactId, p.sessaoId);

      const mensagem = await sendMessageHandler(
        p.admin,
        {
          organization_id: p.orgId,
          actor: { type: "user", id: p.usuarioId },
          requestId: p.requestId,
        },
        { conversation_id: conversationId, type: "text", body: p.mensagem },
      );
      enviados.push({ nome: item.nome, message_id: mensagem.id, status: mensagem.status });
    } catch (err) {
      const mensagem = err instanceof ApiError ? err.message : "Erro desconhecido.";
      falhas.push({ nome: item.nome, erro: mensagem });
      logger.error("disparo: envio falhou", { prospectId: item.id, erro: mensagem, requestId: p.requestId });
    }
  }

  logger.info("disparo concluido", {
    enviados: enviados.length,
    falhas: falhas.length,
    requestId: p.requestId,
  });

  return {
    enviados: enviados.length,
    falhas: falhas.length,
    // A mensagem pode ter ficado `queued` se a sessão caiu no meio — a tela
    // precisa mostrar isso, senão "enviados" vira mentira.
    detalhe_enviados: enviados,
    detalhe_falhas: falhas.slice(0, 50),
  };
}
