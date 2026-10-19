/**
 * O MOTOR DO AGENDAMENTO — o que o cron de 1 minuto executa.
 *
 * ═══ POR QUE UM TICK, E NÃO O POST SÍNCRONO ══════════════════════════════
 *
 * O disparo de hoje (`prospects/disparar`) segura a requisição por ~50 minutos
 * (`esperar()` + `enviarPlano()`): dá para mandar 50 de uma vez, não para
 * mandar "das 7 às 12 e das 13 às 19, uma por minuto, de 19/10 a 23/10". Esse
 * desenho precisa de um TICK de cron — UMA mensagem por minuto, dentro da
 * janela, no período, e que PARE sozinho.
 *
 * ═══ AS TRÊS TRAVAS, E O QUE CADA UMA PROTEGE ════════════════════════════
 *
 *   1. JANELA + PERÍODO + COTA — `podeEnviarAgora` (lib/prospeccao/agendamento).
 *      A cota é do DIA e a janela é do RELÓGIO: confundir as duas faz o
 *      operador achar que "não mandou" quando já mandou tudo.
 *   2. ESPAÇAMENTO GLOBAL POR NÚMERO — `pacing_ledger`. É o que garante
 *      "nunca duas no mesmo segundo", inclusive com DUAS campanhas ativas na
 *      mesma organização: depois de um envio, o tick registra o instante no
 *      estado da org e a próxima campanha do MESMO tick já espera.
 *   3. LEDGER `prospecting_sends` — a unique (campaign_id, prospect_id) torna o
 *      tick idempotente: dois ticks sobrepostos (cron atrasado, contêiner
 *      duplicado) não mandam duas vezes para a mesma empresa.
 *
 * Nunca lança por causa de UMA campanha: o `try` por linha garante que o tick
 * das outras continue — a mesma doutrina do `enviarPlano`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
import { mensagemDaVez } from "@/lib/prospeccao/disparo";
import { enviarParaProspect, type ProspectParaEnvio } from "@/lib/prospeccao/envio";
import { fusoSeguro, relogioNoFuso } from "@/lib/venda-automatica/janela";

import {
  inicioDoDiaNoFuso,
  podeEnviarAgora,
  type JanelaDoDia,
  type MotivoDeEspera,
} from "./agendamento";

/** Teto de campanhas por tick — o tick tem 60s, não é varredura ilimitada. */
const MAX_CAMPANHAS = 200;
/** Quantos prospects restantes o tick busca de uma vez para escolher UM. */
const MAX_PROSPECTS_POR_TICK = 200;

/**
 * Por que o tick não mandou. Os quatro primeiros vêm de `podeEnviarAgora`; os
 * demais são decisões do MOTOR (sessão, lista, elegibilidade do prospect).
 */
export type MotivoDoPulo =
  | MotivoDeEspera
  | "sem_sessao"
  | "sem_mensagem"
  | "sem_prospect_elegivel"
  | "falha_envio"
  | "erro";

export interface ResumoAgendado {
  campanhas: number;
  enviados: number;
  pulados: Array<{ campanha: string; motivo: MotivoDoPulo }>;
  concluidas: number;
  /** Campanhas cujo PERÍODO venceu: pararam sozinhas e podem ser reagendadas. */
  pausadas: number;
}

interface CampanhaAgendada {
  id: string;
  organization_id: string;
  nome: string;
  prospect_ids: string[] | null;
  mensagens: string[] | null;
  espaco_ms: number;
  limite_diario: number;
  data_inicio: string | null;
  data_fim: string | null;
  janelas: unknown;
  ultimo_envio_at: string | null;
}

interface ProspectDoBanco {
  id: string;
  nome: string | null;
  telefone_normalizado: string | null;
  do_not_contact: boolean;
  bloqueado: boolean;
  status_comercial: string;
}

interface EstadoDaOrg {
  fuso: string;
  sessaoId: string | null;
  /** `sent_at` mais recente em `pacing_ledger` da sessão WORKING (ms). */
  ultimoEnvioMs: number | null;
}

const COLUNAS =
  "id, organization_id, nome, prospect_ids, mensagens, espaco_ms, limite_diario, " +
  "data_inicio, data_fim, janelas, ultimo_envio_at";

export async function processarCampanhasAgendadas(
  admin: SupabaseClient,
  agoraIso: string,
  /** Injeção para o teste: o envio real fala com o canal. */
  enviar: typeof enviarParaProspect = enviarParaProspect,
): Promise<ResumoAgendado> {
  const resumo: ResumoAgendado = {
    campanhas: 0,
    enviados: 0,
    pulados: [],
    concluidas: 0,
    pausadas: 0,
  };

  const { data } = await admin
    .from("prospecting_campaigns")
    .select(COLUNAS)
    .eq("status", "ativa")
    .not("agendada_em", "is", null)
    .order("created_at", { ascending: true })
    .limit(MAX_CAMPANHAS);
  const lista = (data ?? []) as unknown as CampanhaAgendada[];
  if (lista.length === 0) return resumo;

  // O fuso e a sessão são da ORG, não da campanha: uma leitura por org, e o
  // `ultimoEnvioMs` do estado é atualizado a cada envio para o ritmo valer
  // entre campanhas do MESMO tick.
  const orgs = new Map<string, EstadoDaOrg>();
  const estadoDaOrg = async (orgId: string): Promise<EstadoDaOrg> => {
    const memo = orgs.get(orgId);
    if (memo) return memo;
    const estado = await carregarEstadoDaOrg(admin, orgId);
    orgs.set(orgId, estado);
    return estado;
  };

  for (const campanha of lista) {
    resumo.campanhas++;
    try {
      const listaFechada = (campanha.prospect_ids ?? []).filter((id) => id.trim() !== "");
      if (listaFechada.length === 0) continue; // nada a mandar — não é "pulo", é campanha vazia

      const org = await estadoDaOrg(campanha.organization_id);
      if (!org.sessaoId) {
        resumo.pulados.push({ campanha: campanha.id, motivo: "sem_sessao" });
        continue;
      }

      // O ledger diz quem JÁ recebeu e quando — idempotência e cota do dia
      // saem da MESMA leitura.
      const { data: linhasEnviadas } = await admin
        .from("prospecting_sends")
        .select("prospect_id, enviado_em")
        .eq("organization_id", campanha.organization_id)
        .eq("campaign_id", campanha.id);
      const enviadas = (linhasEnviadas ?? []) as unknown as Array<{
        prospect_id: string;
        enviado_em: string;
      }>;
      const jaEnviados = new Set(enviadas.map((l) => l.prospect_id));
      const restantes = listaFechada.filter((id) => !jaEnviados.has(id));

      // Não sobra ninguém → a campanha ACABA sozinha (o "pare sozinho").
      if (restantes.length === 0) {
        await admin
          .from("prospecting_campaigns")
          .update({ status: "concluida" })
          .eq("id", campanha.id)
          .eq("organization_id", campanha.organization_id);
        resumo.concluidas++;
        continue;
      }

      // ── A trava GLOBAL por número ────────────────────────────────────────
      // Antes de qualquer decisão da campanha: se o NÚMERO falou há menos que
      // `espaco_ms`, a org inteira espera. É isto que impede duas campanhas de
      // mandarem no mesmo segundo.
      const espacoMs = campanha.espaco_ms > 0 ? campanha.espaco_ms : 60_000;
      if (
        org.ultimoEnvioMs !== null &&
        Date.parse(agoraIso) - org.ultimoEnvioMs < espacoMs
      ) {
        resumo.pulados.push({ campanha: campanha.id, motivo: "intervalo" });
        continue;
      }

      const inicioDia = inicioDoDiaNoFuso(agoraIso, org.fuso);
      const corteDoDia = Date.parse(inicioDia);
      const enviadosHoje = enviadas.filter((l) => Date.parse(l.enviado_em) >= corteDoDia).length;

      const mensagens = (campanha.mensagens ?? [])
        .map((m) => (m ?? "").trim())
        .filter((m) => m !== "");
      if (mensagens.length === 0) {
        resumo.pulados.push({ campanha: campanha.id, motivo: "sem_mensagem" });
        continue;
      }

      const decisao = podeEnviarAgora({
        agoraIso,
        fuso: org.fuso,
        janelas: normalizarJanelas(campanha.janelas),
        dataInicio: campanha.data_inicio,
        dataFim: campanha.data_fim,
        ultimoEnvioAt: campanha.ultimo_envio_at,
        espacoMs,
        enviadosHoje,
        limiteDiario: campanha.limite_diario,
      });
      if (!decisao.pode) {
        // PERÍODO VENCIDO: o dia de hoje passou do `data_fim` e ainda sobra
        // prospect. Deixar em `ativa` criaria a campanha que existe e nunca
        // mais fala — some da tela sem morrer, e ninguém sabe que parou.
        // `pausada` diz o que aconteceu e o PATCH do agendamento reativa:
        // estender a data é justamente o conserto.
        const diaDeHoje = relogioNoFuso(agoraIso, fusoSeguro(org.fuso)).dia;
        if (
          decisao.motivo === "fora_do_periodo" &&
          campanha.data_fim !== null &&
          diaDeHoje > campanha.data_fim
        ) {
          await admin
            .from("prospecting_campaigns")
            .update({ status: "pausada" })
            .eq("id", campanha.id)
            .eq("organization_id", campanha.organization_id);
          resumo.pausadas++;
          continue;
        }
        resumo.pulados.push({ campanha: campanha.id, motivo: decisao.motivo });
        continue;
      }

      // O PRIMEIRO prospect da lista fechada que ainda não recebeu — e que
      // passa na elegibilidade (sem telefone/opt-out/bloqueado/cliente). Sem a
      // elegibilidade, o agendamento mandaria para quem o disparo manual recusa.
      //
      // Em fatias: os primeiros da lista podem ser todos inelegíveis, e desistir
      // na primeira fatia deixaria a campanha parada com gente elegível logo
      // adiante. O teto é 5 fatias — o tick tem 60 segundos.
      let escolhido: ProspectParaEnvio | null = null;
      const TETO_ELEGIVEL = MAX_PROSPECTS_POR_TICK * 5;
      for (let i = 0; i < restantes.length && i < TETO_ELEGIVEL; i += MAX_PROSPECTS_POR_TICK) {
        escolhido = await escolherProspect(
          admin,
          campanha.organization_id,
          restantes.slice(i, i + MAX_PROSPECTS_POR_TICK),
        );
        if (escolhido) break;
      }
      if (!escolhido) {
        resumo.pulados.push({ campanha: campanha.id, motivo: "sem_prospect_elegivel" });
        continue;
      }

      // A rotação CONTINUA de onde parou: o índice é o total de envios da
      // campanha, não zero a cada tick.
      const indice = enviadas.length % mensagens.length;
      const mensagem = mensagemDaVez(mensagens, indice);

      // ── A RESERVA, ANTES do envio ────────────────────────────────────────
      // O ledger é a TRAVA, não só o comprovante: a unique
      // (campaign_id, prospect_id) com `ignoreDuplicates` faz o INSERT
      // devolver linha para UM tick só. Sem isto, dois ticks sobrepostos — o
      // crond NÃO espera o anterior terminar, e um tick com dezenas de
      // campanhas passa de 60s — leriam o mesmo ledger, escolheriam o MESMO
      // prospect e mandariam duas mensagens para a mesma empresa no mesmo
      // minuto. É exatamente o risco que o agendamento existe para não criar.
      //
      // A reserva fica MESMO quando o envio falha, de propósito: ela é o
      // registro de que a TENTATIVA aconteceu. Apagá-la faria o tick insistir
      // no mesmo primeiro colocado a cada minuto — a campanha inteira travada
      // num número ruim, e a cota do dia queimada nele.
      const { data: reserva, error: erroReserva } = await admin
        .from("prospecting_sends")
        .upsert(
          {
            organization_id: campanha.organization_id,
            campaign_id: campanha.id,
            prospect_id: escolhido.id,
            mensagem_indice: indice,
            message_id: null,
            enviado_em: agoraIso,
          },
          { onConflict: "campaign_id,prospect_id", ignoreDuplicates: true },
        )
        .select("prospect_id");
      if (erroReserva) {
        resumo.pulados.push({ campanha: campanha.id, motivo: "erro" });
        logger.error("[prospeccao.agendado] reserva falhou", {
          organizationId: campanha.organization_id,
          campaignId: campanha.id,
          causa: erroReserva.message,
        });
        continue;
      }
      if (!reserva || reserva.length === 0) {
        // Outro tick reservou este prospect entre a leitura e o insert.
        resumo.pulados.push({ campanha: campanha.id, motivo: "intervalo" });
        continue;
      }

      const resultado = await enviar(admin, {
        orgId: campanha.organization_id,
        usuarioId: null,
        requestId: `prospecting-send:${campanha.id}`,
        sessaoId: org.sessaoId,
        prospect: escolhido,
        mensagem,
        agoraIso,
      });
      if (!resultado.ok) {
        resumo.pulados.push({ campanha: campanha.id, motivo: "falha_envio" });
        logger.warn("[prospeccao.agendado] envio falhou", {
          organizationId: campanha.organization_id,
          campaignId: campanha.id,
          prospectId: escolhido.id,
          erro: resultado.erro,
        });
        continue;
      }

      // O comprovante: o id da mensagem no canal. Cortesia — o envio já saiu, e
      // uma falha aqui não pode derrubar o tick.
      await admin
        .from("prospecting_sends")
        .update({ message_id: resultado.messageId })
        .eq("campaign_id", campanha.id)
        .eq("prospect_id", escolhido.id);

      await admin
        .from("prospecting_campaigns")
        .update({ ultimo_envio_at: agoraIso })
        .eq("id", campanha.id)
        .eq("organization_id", campanha.organization_id);

      // O ritmo passa a valer para a PRÓXIMA campanha deste mesmo tick.
      org.ultimoEnvioMs = Date.parse(agoraIso);
      resumo.enviados++;
    } catch (erro) {
      resumo.pulados.push({ campanha: campanha.id, motivo: "erro" });
      logger.error("[prospeccao.agendado] campanha falhou", {
        organizationId: campanha.organization_id,
        campaignId: campanha.id,
        causa: erro instanceof Error ? erro.message : String(erro),
      });
    }
  }

  return resumo;
}

/** Fuso da org + a sessão WORKING + o carimbo mais recente da sessão. */
async function carregarEstadoDaOrg(
  admin: SupabaseClient,
  orgId: string,
): Promise<EstadoDaOrg> {
  const { data: org } = await admin
    .from("organizations")
    .select("timezone")
    .eq("id", orgId)
    .maybeSingle();
  const fuso = fusoSeguro((org as { timezone?: string | null } | null)?.timezone);

  const { data: sessoes } = await admin
    .from("channel_sessions")
    .select("id")
    .eq("organization_id", orgId)
    .eq("status", "WORKING")
    .is("archived_at", null)
    .limit(1);
  const sessaoId = ((sessoes ?? []) as unknown as Array<{ id: string }>)[0]?.id ?? null;

  let ultimoEnvioMs: number | null = null;
  if (sessaoId) {
    const { data: ultimo } = await admin
      .from("pacing_ledger")
      .select("sent_at")
      .eq("organization_id", orgId)
      .eq("channel_session_id", sessaoId)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const sentAt = (ultimo as { sent_at?: string } | null)?.sent_at;
    const ms = sentAt ? Date.parse(sentAt) : Number.NaN;
    ultimoEnvioMs = Number.isFinite(ms) ? ms : null;
  }
  return { fuso, sessaoId, ultimoEnvioMs };
}

/**
 * O primeiro prospect da lista (na ORDEM do array) que ainda pode receber.
 * Inelegível não é recusa da PESSOA — só não é o próximo a mandar; o tick
 * segue para o seguinte em vez de parar a campanha inteira.
 */
async function escolherProspect(
  admin: SupabaseClient,
  orgId: string,
  ids: string[],
): Promise<ProspectParaEnvio | null> {
  if (ids.length === 0) return null;
  const { data } = await admin
    .from("business_prospects")
    .select("id, nome, telefone_normalizado, do_not_contact, bloqueado, status_comercial")
    .eq("organization_id", orgId)
    .in("id", ids);
  const porId = new Map(
    ((data ?? []) as unknown as ProspectDoBanco[]).map((p) => [p.id, p]),
  );

  // A ORDEM é a de `ids` (o array da campanha). O resultado do PostgREST não
  // garante ordem, então o laço é sobre `ids`, nunca sobre o retorno.
  for (const id of ids) {
    const p = porId.get(id);
    if (!p) continue; // prospect apagado — o tick ignora e segue
    if (p.do_not_contact || p.bloqueado) continue;
    if (p.status_comercial === "cliente") continue;
    const fone = p.telefone_normalizado;
    if (!fone || !/^\+\d{8,15}$/.test(fone)) continue;
    return { id, nome: p.nome ?? "(sem nome)", telefone_normalizado: fone };
  }
  return null;
}

/** `janelas` é jsonb; um shape torto vira lista vazia (= sempre dentro). */
function normalizarJanelas(bruto: unknown): JanelaDoDia[] {
  if (!Array.isArray(bruto)) return [];
  const saida: JanelaDoDia[] = [];
  for (const j of bruto) {
    if (!j || typeof j !== "object") continue;
    const inicio = (j as { inicio?: unknown }).inicio;
    const fim = (j as { fim?: unknown }).fim;
    if (typeof inicio === "string" && typeof fim === "string") saida.push({ inicio, fim });
  }
  return saida;
}
