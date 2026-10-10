/**
 * O motor da Venda Automática (spec 18 §6/§14/§11) — o que o cron de 1 minuto
 * executa. Quatro passos por campanha ativa, nesta ordem:
 *
 *   1. PREENCHER  — candidatos do Radar elegíveis viram linhas `queued`
 *   2. ENVIAR     — `queued → contacting → contacted` (cota + janela + guardas)
 *   3. FOLLOW-UP  — 24h/48h sem resposta → texto curto → encerra
 *   4. CLASSIFICAR — resposta do consumidor → ALTO/MEDIO/BAIXO/RECUSOU
 *
 * Idempotência: todo passo reivindica com UPDATE CONDICIONAL no status — dois
 * ticks sobrepostos (cron atrasado, worker duplicado) não duplicam envio. A
 * janela de envio é a da campanha (§2, fuso da org) e vale para envio e
 * follow-up; preencher e classificar pode a qualquer hora.
 *
 * O que este arquivo NÃO faz: inventar preço, mandar fora da janela, pular o
 * opt-out, ou escrever prosa em `interest_level` (o classificador devolve
 * contrato, o banco tem CHECK).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { checarGuardasDeContato } from "@/lib/automation/guarda-do-contato";
import { adiarAteAJanelaAbrir } from "@/lib/automation/janela-do-canal";
import { ensureConversation, sessaoProntaParaEnvio } from "@/lib/automation/start-conversation";
import { checkDailyLimit, espacarEnvio } from "@/lib/automation/throttle";
import type { ActionCtx } from "@/lib/automation/types";
import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { llmEdgeConfigFromEnv } from "@/lib/agent-engine/edge/llm/credentials";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { silenciarPorInteresse } from "@/lib/prospeccao/silenciar-ia";

import { gerarAbordagem } from "./abordagem";
import { classificarResposta } from "./classificacao";
import { contextoDeDuplicidade } from "./dedupe";
import { encontrarOuCriarContato, criarLead, etiquetarConversa } from "./contatos";
import { avaliarElegibilidade, cotaRestante } from "./elegibilidade";
import { registrarEvento } from "./eventos";
import {
  candidatosDaCampanha,
  consumoDoDia,
  filaParaClassificacao,
  filaParaEnvio,
  filaParaFollowup,
  inserirNaFila,
  pendentesDoDia,
  recuperarTravadas,
  reivindicarEnvio,
  transicionar,
  type CampanhaParaFila,
  type LinhaParaClassificar,
} from "./fila";
import { atrasoProximoFollowup, temFollowupPendente, textoDeFollowup } from "./followup";
import { dentroDaJanela, fusoSeguro, relogioNoFuso } from "./janela";
import type { StatusDaFila } from "./tipos";

/** Rejeição registrada por tick — acima disso a timeline vira ruído. */
const MAX_REJEICOES_REGISTRADAS = 20;

export interface ResumoTick {
  campanhas: number;
  selecionados: number;
  rejeitados: number;
  enviados: number;
  followups: number;
  classificados: number;
  falhas: number;
  fora_da_janela: number;
  cota_atingida: number;
}

const VAZIO: ResumoTick = {
  campanhas: 0,
  selecionados: 0,
  rejeitados: 0,
  enviados: 0,
  followups: 0,
  classificados: 0,
  falhas: 0,
  fora_da_janela: 0,
  cota_atingida: 0,
};

interface CampanhaAtiva extends CampanhaParaFila {
  nome: string;
  janela_inicio: string;
  janela_fim: string;
  oferta_produtos: string[];
  perfil_abordagem: string | null;
}

export async function processarTick(
  admin: SupabaseClient,
  agora = new Date(),
): Promise<ResumoTick> {
  const agoraIso = agora.toISOString();
  const resumo: ResumoTick = { ...VAZIO };

  const { data: campanhas } = await admin
    .from("automatic_sales_campaigns")
    .select(
      "id, organization_id, nome, cidade, uf, categorias, limite_diario, janela_inicio, janela_fim, " +
        "oferta_produtos, perfil_abordagem, followup_horas, followup_textos, responsavel_user_id",
    )
    .eq("status", "active")
    .order("created_at", { ascending: true });

  const lista = (campanhas ?? []) as unknown as CampanhaAtiva[];
  if (lista.length === 0) return resumo;

  // Pool de Postgres + config de LLM uma vez por tick (não por linha): se a
  // instalação não tem `SUPABASE_DB_URL`, a IA não existe — e o passo de envio
  // falha com a frase certa em cada linha, sem reabrir conexão 30x.
  let pool: ReturnType<typeof getRequestPool> | null = null;
  try {
    pool = getRequestPool();
  } catch {
    pool = null;
  }
  const llmCfg = pool ? llmEdgeConfigFromEnv(env) : null;

  const fusos = new Map<string, { fuso: string; nome: string }>();
  const infoDaOrg = async (orgId: string) => {
    const memo = fusos.get(orgId);
    if (memo) return memo;
    const { data } = await admin
      .from("organizations")
      .select("timezone, display_name")
      .eq("id", orgId)
      .maybeSingle();
    const row = data as { timezone?: string | null; display_name?: string | null } | null;
    const info = {
      fuso: fusoSeguro(row?.timezone),
      nome: row?.display_name ?? "a loja",
    };
    fusos.set(orgId, info);
    return info;
  };

  for (const campanha of lista) {
    resumo.campanhas++;
    const org = campanha.organization_id;
    const { fuso, nome: nomeDaOrg } = await infoDaOrg(org);
    const { dia } = relogioNoFuso(agoraIso, fuso);
    const janelaAberta = dentroDaJanela(
      agoraIso,
      fuso,
      campanha.janela_inicio,
      campanha.janela_fim,
    );
    if (!janelaAberta) resumo.fora_da_janela++;

    try {
      await recuperarTravadas(admin, org, campanha.id, agoraIso);

      // ── 1. PREENCHER ──────────────────────────────────────────────────────
      const consumidos = await consumoDoDia(admin, org, campanha.id, dia);
      const pendentes = await pendentesDoDia(admin, org, campanha.id);
      const orcamento = campanha.limite_diario - consumidos - pendentes;
      if (orcamento > 0) {
        const candidatos = await candidatosDaCampanha(
          admin,
          org,
          { cidade: campanha.cidade, uf: campanha.uf, categorias: campanha.categorias },
          Math.min(orcamento * 4 + 10, 120),
        );
        let rejeicoes = 0;
        let inseridos = 0;
        for (const candidato of candidatos) {
          if (inseridos >= orcamento) break;
          const contexto = await contextoDeDuplicidade(admin, org, {
            prospectId: candidato.id,
            telefone: candidato.telefone_normalizado,
          });
          const avaliacao = avaliarElegibilidade(
            candidato,
            { cidade: campanha.cidade, categorias: campanha.categorias },
            contexto,
          );
          if (!avaliacao.ok) {
            resumo.rejeitados++;
            if (rejeicoes < MAX_REJEICOES_REGISTRADAS) {
              rejeicoes++;
              await registrarEvento(admin, {
                organizationId: org,
                campaignId: campanha.id,
                tipo: "rejeitada",
                payload: { prospect_id: candidato.id, motivo: avaliacao.motivo },
              });
            }
            continue;
          }

          const contato = await encontrarOuCriarContato(admin, org, {
            prospectId: candidato.id,
            nome: candidato.nome,
            telefone: candidato.telefone_normalizado!,
            categoria: candidato.categorias[0] ?? null,
            cidade: candidato.cidade,
            campaignId: campanha.id,
          });
          const inseriu = await inserirNaFila(admin, {
            organizationId: org,
            campaignId: campanha.id,
            prospectId: candidato.id,
            contactId: contato.id,
            dia,
            snapshot: {
              nome: candidato.nome,
              categoria: candidato.categorias[0] ?? "",
              cidade: candidato.cidade ?? "",
              telefone: candidato.telefone_normalizado,
            },
          });
          if (!inseriu) continue; // corrida: unique parcial já tinha posto

          inseridos++;
          resumo.selecionados++;
          await registrarEvento(admin, {
            organizationId: org,
            campaignId: campanha.id,
            tipo: "selecionada",
            payload: { prospect_id: candidato.id, nome: candidato.nome },
          });
          await registrarEvento(admin, {
            organizationId: org,
            campaignId: campanha.id,
            tipo: contato.criado ? "contato_criado" : "contato_encontrado",
            payload: { contact_id: contato.id },
          });
        }
      }

      // ── 2. ENVIAR (só dentro da janela da campanha) ───────────────────────
      if (janelaAberta) {
        const restante = cotaRestante(
          campanha.limite_diario,
          await consumoDoDia(admin, org, campanha.id, dia),
        );
        if (restante <= 0) {
          resumo.cota_atingida++;
        } else {
          const sessao = await sessaoProntaParaEnvio(admin, org);
          if (!sessao) {
            logger.warn("[venda-automatica] sem sessão de WhatsApp pronta", {
              organizationId: org,
              campaignId: campanha.id,
            });
          } else {
            const linhas = await filaParaEnvio(admin, org, campanha.id, restante);
            for (const linha of linhas) {
              const reivindicou = await reivindicarEnvio(admin, org, linha.id, dia);
              if (!reivindicou) continue;

              // Guardas de contato (mesma da automação): bloqueio, telefone,
              // recusa registrada. ctx sintético porque a função só lê
              // `context.contact` (ver guarda-do-contato.ts).
              const { data: contatoRow } = await admin
                .from("contacts")
                .select("id, is_blocked, phone_number, consent")
                .eq("id", linha.contact_id)
                .eq("organization_id", org)
                .maybeSingle();
              const guarda = checarGuardasDeContato({
                context: { contact: contatoRow ?? undefined },
              } as unknown as ActionCtx);
              if (!guarda.ok) {
                const status: StatusDaFila =
                  guarda.reason === "contact_blocked" || guarda.reason === "consent_declined"
                    ? "not_interested"
                    : "invalid_contact";
                await transicionar(admin, org, linha.id, "contacting", {
                  status,
                  rejection_reason: guarda.reason,
                });
                await registrarEvento(admin, {
                  organizationId: org,
                  campaignId: campanha.id,
                  queueId: linha.id,
                  tipo: "bloqueado",
                  payload: { motivo: guarda.reason },
                });
                continue;
              }

              // Canal: janela do número e cap diário do canal. Bloqueou →
              // devolve para `queued` e para na leva — a próxima tentativa é o
              // próximo tick, não uma corrida contra o throttle.
              const foraDaJanela = await adiarAteAJanelaAbrir(admin, org, sessao);
              if (foraDaJanela) {
                await transicionar(admin, org, linha.id, "contacting", { status: "queued" });
                break;
              }
              const diario = await checkDailyLimit(admin, org, sessao);
              if (!diario.allowed) {
                await transicionar(admin, org, linha.id, "contacting", { status: "queued" });
                break;
              }

              const r = await enviarPrimeiraMensagem({
                admin,
                pool,
                llmCfg,
                organizationId: org,
                campanha,
                queueId: linha.id,
                contactId: linha.contact_id,
                sessao,
                snapshot: linha.snapshot,
                remetente: nomeDaOrg,
              });
              if (r === "enviado") resumo.enviados++;
              else if (r === "falhou") resumo.falhas++;
            }
          }
        }

        // ── 3. FOLLOW-UP ────────────────────────────────────────────────────
        const agendados = await filaParaFollowup(admin, org, campanha.id, agoraIso);
        for (const linha of agendados) {
          const reivindicou = await transicionar(admin, org, linha.id, "contacted", {
            status: "contacting",
          });
          if (!reivindicou) continue;

          const r = await enviarFollowup({
            admin,
            organizationId: org,
            campanha,
            linha,
          });
          if (r === "enviado") resumo.followups++;
          else if (r === "falhou") resumo.falhas++;
        }
      }

      // ── 4. CLASSIFICAR respostas (a qualquer hora: é leitura + texto) ─────
      if (pool && llmCfg) {
        const pend = await filaParaClassificacao(admin, org, campanha.id);
        for (const linha of pend) {
          const feito = await classificarLinha({
            admin,
            pool,
            llmCfg,
            organizationId: org,
            campanha,
            linha,
          });
          if (feito) resumo.classificados++;
        }
      }
    } catch (erro) {
      logger.error("[venda-automatica] tick da campanha falhou", {
        organizationId: org,
        campaignId: campanha.id,
        causa: erro instanceof Error ? erro.message : String(erro),
      });
    }
  }

  return resumo;
}

// ─── Envio da primeira mensagem ──────────────────────────────────────────────

async function enviarPrimeiraMensagem(d: {
  admin: SupabaseClient;
  pool: ReturnType<typeof getRequestPool> | null;
  llmCfg: ReturnType<typeof llmEdgeConfigFromEnv> | null;
  organizationId: string;
  campanha: CampanhaAtiva;
  queueId: string;
  contactId: string;
  sessao: string;
  snapshot: { nome?: string; categoria?: string; cidade?: string; telefone?: string };
  /** A organização que fala (display_name) — não o nome da campanha. */
  remetente: string;
}): Promise<"enviado" | "falhou" | "pulado"> {
  const { admin, organizationId, campanha, queueId, contactId, sessao, snapshot } = d;

  if (!d.pool || !d.llmCfg) {
    await transicionar(admin, organizationId, queueId, "contacting", {
      status: "failed",
      rejection_reason: "ia_indisponivel",
    });
    await registrarEvento(admin, {
      organizationId,
      campaignId: campanha.id,
      queueId,
      tipo: "mensagem_falhou",
      payload: { motivo: "ia_indisponivel" },
    });
    return "falhou";
  }

  // Os NOMES dos produtos ofertados (uuid[] → catálogo real). Sem preço aqui:
  // preço em primeira mensagem fria é spam, e preço que a IA "lembra" é preço
  // inventado — a fonte do preço continua sendo o catálogo.
  let produtos: string[] = [];
  if (campanha.oferta_produtos.length > 0) {
    const { data: doCatalogo } = await admin
      .from("catalog_products")
      .select("nome")
      .eq("organization_id", organizationId)
      .in("id", campanha.oferta_produtos)
      .eq("ativo", true)
      .limit(10);
    produtos = ((doCatalogo ?? []) as Array<{ nome: string }>).map((p) => p.nome);
  }

  // O texto ANTES de abrir conversa: IA que não escreve não deixa conversa
  // vazia no rastro (mesma ordem da ação irmã send_ai_message).
  const gerado = await gerarAbordagem(d.pool, d.llmCfg, {
    tenantId: organizationId,
    contactId,
    empresa: {
      nome: snapshot.nome ?? "",
      categoria: snapshot.categoria ?? "",
      cidade: snapshot.cidade ?? "",
      perfil: campanha.perfil_abordagem,
    },
    produtos,
    remetente: d.remetente,
  });
  if (!gerado.ok) {
    await transicionar(admin, organizationId, queueId, "contacting", {
      status: "failed",
      rejection_reason: `ia: ${gerado.reason}`.slice(0, 200),
    });
    await registrarEvento(admin, {
      organizationId,
      campaignId: campanha.id,
      queueId,
      tipo: "mensagem_falhou",
      payload: { motivo: gerado.reason },
    });
    return "falhou";
  }

  try {
    const conversa = await ensureConversation(admin, organizationId, contactId, sessao);
    await etiquetarConversa(admin, organizationId, conversa, ["venda-automatica", "radar"]);
    await espacarEnvio(sessao);
    const mensagem = await sendMessageHandler(
      admin,
      {
        organization_id: organizationId,
        actor: { type: "webhook_source", id: campanha.id },
        requestId: `automatic-sales:${queueId}`,
      },
      { conversation_id: conversa, type: "text", body: gerado.texto } as Parameters<
        typeof sendMessageHandler
      >[2],
    );

    const agora = new Date().toISOString();
    const horas = campanha.followup_horas ?? [];
    const atraso = atrasoProximoFollowup(horas, 0);
    await transicionar(admin, organizationId, queueId, "contacting", {
      status: "contacted",
      conversation_id: conversa,
      message_id: (mensagem as { id?: string } | null)?.id ?? null,
      ultima_mensagem_at: agora,
      proximo_followup_at: atraso === null ? null : new Date(Date.now() + atraso).toISOString(),
    });
    await registrarEvento(admin, {
      organizationId,
      campaignId: campanha.id,
      queueId,
      tipo: "mensagem_enviada",
      payload: { texto: gerado.texto, conversa: conversa },
    });
    return "enviado";
  } catch (erro) {
    await transicionar(admin, organizationId, queueId, "contacting", {
      status: "failed",
      rejection_reason: (erro instanceof Error ? erro.message : String(erro)).slice(0, 200),
    });
    await registrarEvento(admin, {
      organizationId,
      campaignId: campanha.id,
      queueId,
      tipo: "mensagem_falhou",
      payload: { motivo: erro instanceof Error ? erro.message : String(erro) },
    });
    return "falhou";
  }
}

// ─── Follow-up ───────────────────────────────────────────────────────────────

async function enviarFollowup(d: {
  admin: SupabaseClient;
  organizationId: string;
  campanha: CampanhaAtiva;
  linha: {
    id: string;
    conversation_id: string | null;
    followup_count: number;
    ultima_mensagem_at: string | null;
    snapshot: { nome?: string };
  };
}): Promise<"enviado" | "falhou" | "pulado"> {
  const { admin, organizationId, campanha, linha } = d;
  const volta = async (campos: Record<string, unknown>) =>
    transicionar(admin, organizationId, linha.id, "contacting", { status: "contacted", ...campos });

  // Humano no comando? `bot_silenced_until` é o espelho disso (só o envio de
  // USUÁRIO do CRM o estende — ver _handler.ts): silêncio futuro ou infinito =
  // automação pausada nesta conversa. follow-ups param, o resto continua.
  let sessaoDaConversa: string | null = null;
  if (linha.conversation_id) {
    const { data: conversa } = await admin
      .from("conversations")
      .select("status, bot_silenced_until, channel_session_id")
      .eq("id", linha.conversation_id)
      .eq("organization_id", organizationId)
      .maybeSingle();
    const conv = conversa as {
      status: string;
      bot_silenced_until: string | null;
      channel_session_id: string | null;
    } | null;
    sessaoDaConversa = conv?.channel_session_id ?? null;
    const humano =
      conv &&
      (conv.bot_silenced_until === "infinity" ||
        (conv.bot_silenced_until !== null &&
          conv.bot_silenced_until !== "" &&
          new Date(conv.bot_silenced_until).getTime() > Date.now()));
    const encerrada = conv && ["closed", "archived", "resolved"].includes(conv.status);
    if (humano || encerrada) {
      await volta({ proximo_followup_at: null });
      await registrarEvento(admin, {
        organizationId,
        campaignId: campanha.id,
        queueId: linha.id,
        tipo: "humano_assumiu",
        payload: { conversa: linha.conversation_id },
      });
      return "pulado";
    }

    // Resposta nova desde a última mensagem nossa → a classificação cuida.
    const { data: resposta } = await admin
      .from("messages")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("conversation_id", linha.conversation_id)
      .eq("direction", "inbound")
      .gt("created_at", linha.ultima_mensagem_at ?? new Date(0).toISOString())
      .limit(1)
      .maybeSingle();
    if (resposta) {
      // ─── A IA FALA UMA VEZ ───────────────────────────────────────────────
      //
      // O prospect respondeu. A fila de venda automatica nao e a unica coisa
      // que atende: o dispatcher de IA responde a conversa inteira, e sem calar
      // o BOT ele continua se apresentando como atendente — que e o defeito que
      // o pedido descreve ("a IA continua a conversa como se fosse o atendente
      // humano").
      //
      // A decisao do usuario em 09/10/2026: calar no PRIMEIRO interesse.
      //
      // O corpo da resposta vem junto porque "respondeu" nao basta: um "boa
      // tarde" nao e interesse, e calar a IA numa conversa que ela atendia bem
      // e pior do que nao calar. Ver `mostraInteresse`.
      const { data: corpoDaResposta } = await admin
        .from("messages")
        .select("body")
        .eq("id", (resposta as unknown as { id: string }).id)
        .maybeSingle();

      const calada = await silenciarPorInteresse(admin, {
        organizationId,
        conversationId: linha.conversation_id,
        corpo: (corpoDaResposta as unknown as { body: string | null } | null)?.body ?? null,
      });

      if (calada.conversou) {
        await registrarEvento(admin, {
          organizationId,
          campaignId: campanha.id,
          queueId: linha.id,
          tipo: "humano_assumiu",
          payload: { conversa: linha.conversation_id, motivo: calada.motivo },
        });
        // A campanha NAO acaba: a linha sai do follow-up e vira lead quente,
        // que e informacao que a pessoa pagou para conseguir.
        await volta({ proximo_followup_at: null, status: "responded" });
      } else {
        await volta({});
      }
      return "pulado";
    }
  }

  const horas = campanha.followup_horas ?? [];
  const texto = textoDeFollowup(
    campanha.followup_textos ?? [],
    linha.followup_count,
    linha.snapshot.nome ?? "",
  );
  if (!texto) {
    await transicionar(admin, organizationId, linha.id, "contacting", {
      status: "no_response",
      proximo_followup_at: null,
    });
    await registrarEvento(admin, {
      organizationId,
      campaignId: campanha.id,
      queueId: linha.id,
      tipo: "sem_resposta",
      payload: { followups: linha.followup_count },
    });
    return "pulado";
  }

  try {
    if (!linha.conversation_id || !sessaoDaConversa) throw new Error("sem_conversa");
    await espacarEnvio(sessaoDaConversa);
    await sendMessageHandler(
      admin,
      {
        organization_id: organizationId,
        actor: { type: "webhook_source", id: campanha.id },
        requestId: `automatic-sales:${linha.id}:fu${linha.followup_count + 1}`,
      },
      { conversation_id: linha.conversation_id, type: "text", body: texto } as Parameters<
        typeof sendMessageHandler
      >[2],
    );

    const count = linha.followup_count + 1;
    const agora = new Date();
    await registrarEvento(admin, {
      organizationId,
      campaignId: campanha.id,
      queueId: linha.id,
      tipo: "followup_enviado",
      payload: { numero: count, texto },
    });

    if (temFollowupPendente(horas, count)) {
      const atraso = atrasoProximoFollowup(horas, count);
      await transicionar(admin, organizationId, linha.id, "contacting", {
        status: "contacted",
        followup_count: count,
        ultima_mensagem_at: agora.toISOString(),
        proximo_followup_at:
          atraso === null ? null : new Date(agora.getTime() + atraso).toISOString(),
      });
    } else {
      // Fim de linha (§14): sem resposta após todos os follow-ups.
      await transicionar(admin, organizationId, linha.id, "contacting", {
        status: "no_response",
        followup_count: count,
        ultima_mensagem_at: agora.toISOString(),
        proximo_followup_at: null,
      });
      if (linha.conversation_id) {
        await etiquetarConversa(admin, organizationId, linha.conversation_id, ["va-sem-resposta"]);
      }
      await registrarEvento(admin, {
        organizationId,
        campaignId: campanha.id,
        queueId: linha.id,
        tipo: "sem_resposta",
        payload: { followups: count },
      });
    }
    return "enviado";
  } catch (erro) {
    await transicionar(admin, organizationId, linha.id, "contacting", {
      status: "failed",
      rejection_reason: (erro instanceof Error ? erro.message : String(erro)).slice(0, 200),
    });
    await registrarEvento(admin, {
      organizationId,
      campaignId: campanha.id,
      queueId: linha.id,
      tipo: "mensagem_falhou",
      payload: { motivo: erro instanceof Error ? erro.message : String(erro), followup: true },
    });
    return "falhou";
  }
}

// ─── Classificação ───────────────────────────────────────────────────────────

async function classificarLinha(d: {
  admin: SupabaseClient;
  pool: ReturnType<typeof getRequestPool>;
  llmCfg: ReturnType<typeof llmEdgeConfigFromEnv>;
  organizationId: string;
  campanha: CampanhaAtiva;
  linha: LinhaParaClassificar;
}): Promise<boolean> {
  const { admin, organizationId, campanha, linha } = d;

  const { data: novas } = await admin
    .from("messages")
    .select("id, body, direction, created_at")
    .eq("organization_id", organizationId)
    .eq("conversation_id", linha.conversation_id)
    .eq("direction", "inbound")
    .gt("created_at", linha.ultima_mensagem_at)
    .order("created_at", { ascending: false })
    .limit(5);
  const respostas = (novas ?? []) as Array<{ id: string; body: string | null; created_at: string }>;
  if (respostas.length === 0) return false;

  // Trecho: as últimas 10 mensagens da conversa, cronológicas — o classificador
  // classifica a RESPOSTA no contexto do que foi perguntado.
  const { data: ultimas } = await admin
    .from("messages")
    .select("body, direction, created_at")
    .eq("organization_id", organizationId)
    .eq("conversation_id", linha.conversation_id)
    .order("created_at", { ascending: false })
    .limit(10);
  const trecho = [...(ultimas ?? [])]
    .reverse()
    .map(
      (m: { body: string | null; direction: string }) =>
        `${m.direction === "inbound" ? "Cliente" : "Loja"}: ${m.body ?? "(mídia)"}`,
    )
    .join("\n");

  const resultado = await classificarResposta(d.pool, d.llmCfg, {
    tenantId: organizationId,
    contactId: linha.contact_id,
    trecho,
  });
  if (!resultado.ok) {
    // Sem evento: a falha do classificador (orçamento, provider fora) não é
    // mudança de estado da fila — log e a próxima tentativa reprocessa.
    logger.warn("[venda-automatica] classificação não concluída", {
      organizationId,
      campaignId: campanha.id,
      queueId: linha.id,
      causa: resultado.reason,
    });
    return false;
  }

  const c = resultado.classificacao;
  const novoStatus: StatusDaFila =
    c.interesse === "recusou"
      ? "not_interested"
      : c.oportunidade
        ? "opportunity"
        : c.interesse === "alto"
          ? "qualified_lead"
          : "responded";

  const vistoEm = respostas[0]!.created_at;
  const ok = await transicionar(admin, organizationId, linha.id, linha.status, {
    status: novoStatus,
    interest_level: c.interesse,
    proximo_followup_at: null,
    ultima_mensagem_at: vistoEm,
  });
  if (!ok) return false;

  await registrarEvento(admin, {
    organizationId,
    campaignId: campanha.id,
    queueId: linha.id,
    tipo: "resposta_recebida",
    payload: { respostas: respostas.length },
  });
  await registrarEvento(admin, {
    organizationId,
    campaignId: campanha.id,
    queueId: linha.id,
    tipo: "interesse_classificado",
    payload: { interesse: c.interesse, oportunidade: c.oportunidade, necessidade: c.necessidade },
  });

  if (c.interesse === "alto" || c.interesse === "medio") {
    await etiquetarConversa(admin, organizationId, linha.conversation_id, ["va-interessado"]);
  }
  if (novoStatus === "opportunity") {
    await etiquetarConversa(admin, organizationId, linha.conversation_id, ["va-oportunidade"]);
    await registrarEvento(admin, {
      organizationId,
      campaignId: campanha.id,
      queueId: linha.id,
      tipo: "oportunidade_criada",
      payload: { necessidade: c.necessidade },
    });
  }

  // Recusou → opt-out no prospect: a próxima campanha nem considera.
  if (c.interesse === "recusou" && linha.prospect_id) {
    await admin
      .from("business_prospects")
      .update({ do_not_contact: true, updated_at: new Date().toISOString() })
      .eq("id", linha.prospect_id)
      .eq("organization_id", organizationId);
  }

  // Lead no funil para alto/oportunidade (§12): dono = responsável da campanha.
  if (
    (novoStatus === "qualified_lead" || novoStatus === "opportunity") &&
    !linha.lead_id &&
    linha.prospect_id
  ) {
    const leadId = await criarLead(admin, organizationId, {
      contactId: linha.contact_id,
      title: linha.snapshot?.nome ?? "Novo lead",
      prospectId: linha.prospect_id,
      categoria: linha.snapshot?.categoria ?? null,
      cidade: linha.snapshot?.cidade ?? null,
      campaignId: campanha.id,
      interestLevel: c.interesse,
      necessidade: c.necessidade,
      responsavelUserId: campanha.responsavel_user_id,
    });
    if (leadId) {
      await transicionar(admin, organizationId, linha.id, novoStatus, { lead_id: leadId });
      await registrarEvento(admin, {
        organizationId,
        campaignId: campanha.id,
        queueId: linha.id,
        tipo: "lead_criado",
        payload: { lead_id: leadId },
      });
    }
  }

  return true;
}
