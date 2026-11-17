/**
 * GET/POST /api/v1/cron/recover-stuck-messages — issue #129.
 *
 * Mensagem outbound nasce com `status='sending'` e só sai desse estado quando
 * quem envia confirma (ack do canal, resposta do worker). Quando o envio nunca
 * acontece, a linha fica `sending` PARA SEMPRE — e o que o self-hoster vê no
 * inbox é uma mensagem eternamente "enviando": um sinal de progresso para algo
 * que não vai acontecer.
 *
 * Essa é a pior forma de falha num produto que a pessoa instala sozinha numa
 * VPS: não há ninguém monitorando, então ela conclui que o produto é lento, não
 * que está quebrado, e nunca abre um chamado. O `CLAUDE.md` e o PRD 03 prometem
 * este cron desde o começo (regra de negócio W-12); ele simplesmente não
 * existia — o `git grep` só achava a promessa, nunca a rota.
 *
 * O que ele faz, e o que deliberadamente NÃO faz:
 *
 *   - marca `failed` toda outbound `sending` mais velha que 5 min (o prazo do
 *     `CLAUDE.md`), gravando `error_code`/`error_message` para quem investigar;
 *   - emite `message.failed` por mensagem, como manda a regra W-12. Não dá para
 *     contar com o trigger: `trg_messages_emit_event` é AFTER **INSERT**, então
 *     mudança de status não emite nada — o evento que a regra promete só existe
 *     se este cron o emitir;
 *   - abre UM aviso por organização na Central de avisos
 *     (`agent_inbox_items`, kind `message_send_stuck`), porque marcar `failed`
 *     em silêncio troca uma falha invisível por outra: a bolha muda de ícone
 *     numa conversa que ninguém tem motivo para reabrir. O aviso é UM por
 *     organização — atualizado a cada rodada enquanto a condição existir e
 *     fechado sozinho quando ela sumir —, nunca um por rodada: medido numa
 *     instalação real, a versão que inseria a cada tick acumulou **27 avisos
 *     idênticos em aberto** do mesmo problema;
 *   - **não reenvia nada.** Reenviar exigiria saber POR QUE não foi, e o envio
 *     em dobro é pior que o não-envio: o cliente recebe a mesma mensagem duas
 *     vezes. Retry é decisão de quem lê o aviso.
 *
 * Auth: mesmo contrato dos demais crons (Bearer INTERNAL_CRON_SECRET|
 * INTERNAL_SECRET, fail-closed).
 *
 * NOTA DE DEPLOY: não há `vercel.json` neste repo (self-host). O agendamento
 * vive no serviço `scheduler` do `docker-compose.prod.yml`.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Prazo do `CLAUDE.md` (seção de canal) e da regra W-12. Não é chute: é maior que
 * qualquer envio legítimo (o throttle anti-ban trabalha em segundos) e menor
 * que a paciência de quem está olhando a tela.
 */
export const STUCK_AFTER_MS = 5 * 60 * 1000;

/** Teto por invocação — a rodada seguinte pega o resto. */
const SCAN_LIMIT = 500;

interface StuckMessage {
  id: string;
  organization_id: string;
  conversation_id: string;
  created_at: string;
  sent_via: string;
  /**
   * `null` = o transporte NUNCA aceitou a mensagem: o envio morreu antes de
   * receber o id externo, e o ack não tem como casar com esta linha.
   *
   * Preenchido = o transporte aceitou e devolveu o id; a mensagem SAIU do CRM e o que
   * falta é a confirmação do WhatsApp. Os dois casos não são a mesma coisa e o
   * aviso não pode dizer a mesma frase para ambos.
   */
  external_id: string | null;
}

export interface RecoverResult {
  scanned: number;
  failed: number;
  organizations: number;
  /** Avisos abertos fechados porque a condição deixou de existir nesta rodada. */
  resolved: number;
}

/**
 * Separado do handler HTTP para o teste poder exercitar a REGRA sem montar
 * request/auth — e para o handler ficar sendo só borda.
 */
export async function recoverStuckMessages(
  admin: ReturnType<typeof createAdminClient>,
  now: Date,
  requestId: string,
): Promise<RecoverResult> {
  const cutoff = new Date(now.getTime() - STUCK_AFTER_MS).toISOString();

  // O corte é por `created_at`, como a regra W-12 escreve — e não por `sent_at`,
  // que é o campo que o caminho de envio reescreve. Medir a idade pela coluna
  // que outro código atualiza faria a mensagem rejuvenescer e escapar do cron.
  const { data, error } = await admin
    .from("messages")
    .select("id, organization_id, conversation_id, created_at, sent_via, external_id")
    .eq("direction", "outbound")
    .eq("status", "sending")
    .lt("created_at", cutoff)
    .limit(SCAN_LIMIT);

  if (error) throw new Error(`query_failed: ${error.message}`);

  const stuck = (data ?? []) as StuckMessage[];
  if (stuck.length === 0) {
    // ─── TODO LAÇO SE FECHA ────────────────────────────────────────────────
    //
    // Rodada sem nada preso significa que a condição que abriu o aviso deixou
    // de existir: os acks chegaram, o worker voltou ou alguém reenviou. Sem
    // este fechamento o self-hoster vê "27 em aberto" de um problema que já
    // acabou — e a Central perde credibilidade justamente quando ela precisa
    // ser lida. Fechar é o efeito de a condição ter desaparecido, não uma
    // decisão de quem instalou.
    const { data: fechados, error: fecharErr } = await admin
      .from("agent_inbox_items")
      .update({ status: "resolved" })
      .eq("kind", "message_send_stuck")
      .eq("status", "open")
      .select("id");
    if (fecharErr) {
      logger.warn("[recover-stuck-messages] não consegui fechar os avisos antigos", {
        error: fecharErr.message,
        requestId,
      });
      return { scanned: 0, failed: 0, organizations: 0, resolved: 0 };
    }
    const resolvidos = ((fechados ?? []) as { id: string }[]).length;
    if (resolvidos > 0) {
      logger.info("[recover-stuck-messages] avisos fechados: nada mais preso", {
        resolved: resolvidos,
        requestId,
      });
    }
    return { scanned: 0, failed: 0, organizations: 0, resolved: resolvidos };
  }

  const porOrg = new Map<string, StuckMessage[]>();
  for (const m of stuck) porOrg.set(m.organization_id, [...(porOrg.get(m.organization_id) ?? []), m]);

  let marcadas = 0;
  let resolvidosNestaRodada = 0;
  const orgsComAviso: string[] = [];

  for (const [orgId, mensagens] of porOrg) {
    // O `.eq("status","sending")` no UPDATE É o claim atômico: se o envio
    // concluiu entre o SELECT e o UPDATE (corrida real — o ack pode chegar a
    // qualquer momento), a linha já não está `sending` e não é tocada. Sem
    // isso, este cron marcaria como falha uma mensagem que o cliente recebeu.
    const { data: updated, error: updErr } = await admin
      .from("messages")
      .update({
        status: "failed",
        error_code: "send_timeout",
        error_message: `Envio não confirmado em ${STUCK_AFTER_MS / 60000} min — marcada como falha por recover-stuck-messages.`,
        updated_at: now.toISOString(),
      })
      .in(
        "id",
        mensagens.map((m) => m.id),
      )
      .eq("organization_id", orgId)
      .eq("status", "sending")
      .select("id");

    if (updErr) {
      logger.error("[recover-stuck-messages] update falhou", {
        error: updErr.message,
        organization_id: orgId,
        requestId,
      });
      continue;
    }

    const marcadasAgora = (updated ?? []) as { id: string }[];
    const n = marcadasAgora.length;
    if (n === 0) continue; // outra rodada (ou o ack) chegou primeiro
    marcadas += n;
    orgsComAviso.push(orgId);

    // W-12 promete o evento `message.failed`. O trigger não serve: ele é AFTER
    // INSERT, então mudar o status não emite nada. Só as linhas que ESTE tick
    // realmente marcou — emitir pelas que a corrida levou seria evento de uma
    // falha que não houve.
    const porMensagem = new Map(mensagens.map((m) => [m.id, m]));
    await Promise.all(
      marcadasAgora.map(({ id }) =>
        admin
          .rpc("emit_event" as never, {
            p_event_type: "message.failed",
            p_entity_kind: "message",
            p_entity_id: id,
            p_payload: {
              message_id: id,
              conversation_id: porMensagem.get(id)?.conversation_id ?? null,
              reason: "send_timeout",
              stuck_after_ms: STUCK_AFTER_MS,
            },
            p_metadata: { source: "recover-stuck-messages", request_id: requestId },
            p_organization_id: orgId,
          } as never)
          .then(({ error: emitErr }: { error: { message: string } | null }) => {
            if (emitErr) {
              logger.warn("[recover-stuck-messages] emit message.failed falhou", {
                error: emitErr.message,
                message_id: id,
                requestId,
              });
            }
          }),
      ),
    );

    // ─── A FRASE NÃO PODE AFIRMAR MAIS DO QUE O SISTEMA SABE ────────────────
    //
    // `sending` tem dois mundos dentro:
    //
    //   external_id null → o transporte nunca aceitou; a mensagem NÃO saiu;
    //   external_id preenchido → o transporte aceitou e devolveu id; a mensagem saiu
    //   do CRM e o que falta é o ack do WhatsApp.
    //
    // Dizer "não chegou ao cliente" nos dois casos era uma afirmação que o
    // dado não sustenta: no segundo, o normal é que tenha chegado e o ack
    // tenha se perdido (webhook fora do ar, reload da sessão). O dono do
    // negócio precisa saber a diferença para decidir se reenvia.
    const semSaida = mensagens.filter((m) => !m.external_id).length;
    const semConfirmacao = n - semSaida;
    const titulo =
      semConfirmacao === 0
        ? n === 1
          ? "Uma resposta não saiu do sistema"
          : `${n} respostas não saíram do sistema`
        : semSaida === 0
          ? "Uma resposta saiu sem confirmação de entrega"
          : `${n} respostas ficaram sem confirmação de envio`;

    const partes: string[] = [];
    if (semSaida > 0) {
      partes.push(
        `${semSaida} ${semSaida === 1 ? "mensagem nunca chegou ao WhatsApp" : "mensagens nunca chegaram ao WhatsApp"}: o envio parou antes de o canal aceitar, então não há como ela ter saído.`,
      );
    }
    if (semConfirmacao > 0) {
      partes.push(
        `${semConfirmacao} ${semConfirmacao === 1 ? "mensagem foi aceita pelo transporte" : "mensagens foram aceitas pelo transporte"} e seguiu sem confirmação de entrega — é provável que ${semConfirmacao === 1 ? "tenha chegado" : "tenham chegado"} ao cliente; o que faltou foi o aviso do WhatsApp.`,
      );
    }
    partes.push(
      `Passaram de ${STUCK_AFTER_MS / 60000} minutos e foram marcadas como falha.Verifique se a conexão do WhatsApp está ativa e se o worker de envio está rodando. Nada foi reenviado automaticamente — reenviar sem saber a causa arrisca mandar a mesma mensagem duas vezes.`,
    );
    const corpo = partes.join(" ").replace("falha.Verifique", "falha. Verifique");

    // ─── UM AVISO POR ORGANIZAÇÃO, NÃO UM POR RODADA ─────────────────────────
    //
    // O cron roda a cada minuto. Inserir um aviso por rodada transformou uma
    // falha persistente em uma pilha: medido numa instalação real, **27 avisos
    // idênticos em aberto** — todos do mesmo problema, nenhum fechado. A
    // condição é a MESMA enquanto a causa existir, então o item é o mesmo; a
    // rodada nova atualiza o que já está aberto (contagem e conversa mais
    // recente) em vez de abrir outro. Quando a condição desaparece, a rodada
    // sem nada preso fecha (ver início da função).
    const { data: abertos, error: buscaErr } = await admin
      .from("agent_inbox_items")
      .select("id")
      .eq("organization_id", orgId)
      .eq("kind", "message_send_stuck")
      .eq("status", "open");

    if (buscaErr) {
      logger.warn("[recover-stuck-messages] não consegui checar aviso aberto — evito duplicar mesmo assim", {
        error: buscaErr.message,
        organization_id: orgId,
        requestId,
      });
    }

    const linha = {
      organization_id: orgId,
      kind: "message_send_stuck",
      severity: "critical" as const,
      title: titulo,
      body: corpo,
      ref_kind: "conversation",
      ref_id: mensagens[0]?.conversation_id ?? null,
    };

    // A pilha que já existe também é desfeita aqui: numa instalação real havia
    // **27 abertos** antes deste conserto. Um fica (atualizado com o estado de
    // agora) e os outros são fechados como duplicatas do MESMO fato — não como
    // "resolvidos" por alguém, porque ninguém os resolveu.
    const lista = (abertos ?? []) as { id: string }[];
    const existente = lista[0];
    const duplicatas = lista.slice(1).map((i) => i.id);

    const { error: inboxErr } = existente
      ? await admin.from("agent_inbox_items").update(linha).eq("id", existente.id)
      : await admin.from("agent_inbox_items").insert(linha);
    if (inboxErr) {
      // O aviso é o que torna a falha visível; perdê-lo em silêncio recriaria o
      // defeito que este cron existe para consertar.
      logger.error("[recover-stuck-messages] aviso na Central falhou", {
        error: inboxErr.message,
        organization_id: orgId,
        requestId,
      });
    }

    if (duplicatas.length > 0) {
      const { error: dupErr } = await admin
        .from("agent_inbox_items")
        .update({ status: "resolved" })
        .in("id", duplicatas);
      if (dupErr) {
        logger.warn("[recover-stuck-messages] não consegui fechar avisos duplicados", {
          error: dupErr.message,
          organization_id: orgId,
          duplicatas: duplicatas.length,
          requestId,
        });
      } else {
        resolvidosNestaRodada += duplicatas.length;
      }
    }
  }

  return {
    scanned: stuck.length,
    failed: marcadas,
    organizations: orgsComAviso.length,
    resolved: resolvidosNestaRodada,
  };
}

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  const accepted = [env.INTERNAL_CRON_SECRET, env.INTERNAL_SECRET].filter(Boolean);
  if (accepted.length === 0 || !provided || !accepted.includes(provided)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }

  let result: RecoverResult;
  try {
    result = await recoverStuckMessages(createAdminClient(), new Date(), requestId);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error("[recover-stuck-messages] falhou", { error: detail, requestId });
    return fail("internal_error", "Failed to recover stuck messages.", 500, { requestId });
  }

  // Varredura que não marcou nada não é mutação e não ocupa linha de auditoria
  // (mesmo critério do snooze-watcher e do followup-flow-worker).
  if (result.failed > 0) {
    void audit({
      action: "message.recover_stuck_run",
      organizationId: null,
      bypassedRls: true,
      metadata: result as unknown as Record<string, unknown>,
      requestId,
    });
  }

  return ok(result, { requestId });
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}
