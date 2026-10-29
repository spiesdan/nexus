/**
 * POST /api/v1/prospecting/prospects/disparar — as mensagens para os
 * prospects escolhidos, com rotação, ritmo e simulação por padrão.
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
 * ═══ AS VARIAÇÕES (ANTI-BAN) ═════════════════════════════════════════════
 *
 * O corpo aceita `mensagens` (1 a 5 textos) além do `mensagem` único de
 * sempre. O 1º envio leva a 1ª, o 2º a 2ª, e a rotação volta à 1ª quando
 * acaba: 1→2→3→1. Quem recebe qual vem do PLANO (`mensagem_indice`), não de
 * um contador dentro do laço — assim a simulação já mostra a rotação antes de
 * qualquer mensagem sair, e recusa não consome uma volta.
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

import { ApiError } from "@/lib/api/types";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { jitterMs } from "@/lib/automation/throttle";
import { porFatias } from "@/lib/db/por-fatias";
import { enviarParaProspect } from "@/lib/prospeccao/envio";
import {
  ESPACO_PADRAO_MS,
  LIMITE_PADRAO_DIA,
  MENSAGENS_POR_DISPARO_MAX,
  ROTULO_DA_RECUSA,
  mensagemDaVez,
  planejarDisparo,
  validarMensagem,
  type CandidatoAoDisparo,
} from "@/lib/prospeccao/disparo";
import {
  bloqueadaPorQualidade,
  escolherSessaoDaCampanha,
  type SessaoDaCampanha,
} from "@/lib/prospeccao/canal-da-campanha";
import { categoriaCombinaComCampanha, categoriaDaCampanhaQueCombina, categoriaEfetiva } from "@/lib/prospeccao/categoria-efetiva";
import type { TemplateDoEnvio } from "@/lib/prospeccao/envio";
import type { TipoDaMensagem } from "@/lib/prospeccao/mensagem-da-campanha";
import { idsReservadosPorOutras } from "@/lib/prospeccao/reserva-de-campanha";
import {
  categoriasSemModelo,
  chaveDaCategoria,
  lerTemplatesPorCategoria,
} from "@/lib/prospeccao/templates-por-categoria";
import { lerTetoDoNumero } from "@/lib/prospeccao/teto-do-numero";
import { soltarDisparo, travarDisparo, validadeDaTrava } from "@/lib/prospeccao/trava-de-disparo";
import {
  validarBindDaCampanha,
  validarTemplatesDaCampanha,
} from "@/lib/prospeccao/validacao-da-campanha";
import { validateRequest } from "@/lib/schemas";
import { disparoSchema } from "@/lib/schemas/prospeccao";
import { createAdminClient } from "@/lib/supabase/admin";
import { tagDeIdioma } from "@/lib/i18n/datas";
import { IDIOMA_PADRAO } from "@/lib/i18n/idiomas";
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
    return fail("internal_error", "Erro interno.", 500, { requestId });
  }

  const admin = createAdminClient();

  // A validação do texto é a do planejador — a mesma que o teste cobre, e a
  // mesma que a tela vai mostrar. Aqui é só para devolver 400 em vez de um
  // plano com 500 recusas de "mensagem vazia" (que não é um motivo de recusa
  // de ninguém).
  //
  // As variações ganham do texto único quando os dois vêm: quem manda
  // `mensagens` está pedindo rotação, e ignorar em silêncio seria pior que
  // recusar. Cada uma passa pela MESMA régua (vazia, tamanho) da mensagem
  // única — uma variação em branco sairia como bolha vazia no WhatsApp.
  //
  // 0284: a checagem de vazio NÃO acontece aqui, porque uma campanha de
  // template não manda texto. Ela é feita depois de ler o tipo da campanha.
  const mensagens = (entrada.mensagens?.length
    ? entrada.mensagens
    : [entrada.mensagem ?? ""]
  )
    .map((m) => m.trim())
    .filter((m) => m !== "")
    .slice(0, MENSAGENS_POR_DISPARO_MAX);

  // ─── A campanha que recebe o disparo (0277) ──────────────────────────────
  // Envio real SEM campanha não existe: é a campanha que reserva a empresa,
  // aplica o recorte de categoria e grava o ledger global. A simulação pode
  // rodar sem — a tela de Empresas simula antes de criar a campanha.
  const campanhaId = entrada.campaign_id ?? null;
  if (!entrada.dry_run && campanhaId === null) {
    return fail(
      "validation_failed",
      "Escolha a campanha que recebe este disparo. A empresa fica reservada nela e não pode ser mensageada por outra.",
      422,
      { requestId },
    );
  }

  let campanha: {
    id: string;
    nome: string;
    categorias: string[] | null;
    prospect_ids: string[] | null;
    mensagem_tipo: string | null;
    template_name: string | null;
    template_language: string | null;
    template_contract_hash: string | null;
    template_values: Record<string, string> | null;
    templates_por_categoria: unknown;
  } | null = null;
  if (campanhaId !== null) {
    const { data: c, error: errCampanha } = await admin
      .from("prospecting_campaigns")
      .select(
        "id, nome, categorias, publico, prospect_ids, mensagem_tipo, template_name, template_language, template_contract_hash, template_values, templates_por_categoria",
      )
      .eq("id", campanhaId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (errCampanha) {
      return fail("internal_error", "Erro ao ler a campanha.", 500, { requestId });
    }
    if (!c) return fail("not_found", "Campanha não encontrada.", 404, { requestId });
    const linha = c as unknown as {
      id: string;
      nome: string;
      categorias: string[] | null;
      publico: string | null;
      prospect_ids: string[] | null;
      mensagem_tipo: string | null;
      template_name: string | null;
      template_language: string | null;
      template_contract_hash: string | null;
      template_values: Record<string, string> | null;
      templates_por_categoria: unknown;
    };
    if (linha.publico === "contatos") {
      return fail(
        "validation_failed",
        "Esta campanha é de recuperação de contatos; o disparo de empresas usa outra tela.",
        422,
        { requestId },
      );
    }
    campanha = {
      id: linha.id,
      nome: linha.nome,
      categorias: linha.categorias,
      prospect_ids: linha.prospect_ids,
      mensagem_tipo: linha.mensagem_tipo,
      template_name: linha.template_name,
      template_language: linha.template_language,
      template_contract_hash: linha.template_contract_hash,
      template_values: linha.template_values,
      templates_por_categoria: linha.templates_por_categoria,
    };
  }

  // ─── O tipo da mensagem e o bind do modelo (0284/0285) ──────────────────
  // Sem campanha (simulação da tela de Empresas) é sempre texto. Com campanha,
  // a declaração manda. O bind é conferido ANTES de qualquer reserva: um
  // modelo obsoleto gastaria uma reserva por empresa e a Meta recusaria todas.
  //
  // Com `templates_por_categoria`, TODOS os modelos são conferidos e a
  // cobertura das categorias é exigida. O modelo de cada empresa é escolhido
  // no envio, pela categoria efetiva — não há fallback para o modelo de outra
  // categoria.
  const tipo: TipoDaMensagem =
    campanha?.mensagem_tipo === "template" ? "template" : "texto";
  let templateDoEnvio: TemplateDoEnvio | null = null;
  const templatesPorCategoria = new Map<string, TemplateDoEnvio>();
  const binds = campanha ? lerTemplatesPorCategoria(campanha.templates_por_categoria) : [];
  if (tipo === "template" && campanha) {
    if (binds.length > 0) {
      const semModelo = categoriasSemModelo(binds, campanha.categorias ?? []);
      if (semModelo.length > 0) {
        return fail(
          "validation_failed",
          `A campanha não tem modelo para: ${semModelo.join(", ")}. Edite a campanha e configure todas as categorias.`,
          422,
          { requestId },
        );
      }
      const veredito = await validarTemplatesDaCampanha(admin, orgId, binds, {
        exigirCanal: false,
      });
      if (!veredito.ok) {
        return fail("validation_failed", veredito.erro, 422, { requestId });
      }
      for (const t of veredito.templates) {
        templatesPorCategoria.set(chaveDaCategoria(t.categoria), {
          name: t.name,
          language: t.language,
          contractHash: t.contractHash,
          values: t.values,
          components: t.components,
          parameterFormat: t.parameterFormat,
        });
      }
      // O primeiro mapeamento é o bind PADRÃO: cobre o curinga histórico e
      // mantém o resumo da simulação com um modelo nomeado.
      const primeiro = veredito.templates[0]!;
      templateDoEnvio = {
        name: primeiro.name,
        language: primeiro.language,
        contractHash: primeiro.contractHash,
        values: primeiro.values,
        components: primeiro.components,
        parameterFormat: primeiro.parameterFormat,
      };
    } else {
      const veredito = await validarBindDaCampanha(
        admin,
        orgId,
        {
          tipo: "template",
          name: campanha.template_name,
          language: campanha.template_language,
          contractHash: campanha.template_contract_hash,
          values: campanha.template_values ?? {},
        },
        { exigirCanal: false },
      );
      if (!veredito.ok || !veredito.template) {
        return fail("validation_failed", veredito.ok ? "Modelo inválido." : veredito.erro, 422, {
          requestId,
        });
      }
      templateDoEnvio = {
        name: veredito.template.name,
        language: veredito.template.language,
        contractHash: veredito.template.contractHash,
        values: campanha.template_values ?? {},
        components: veredito.template.components,
        parameterFormat: veredito.template.parameterFormat,
      };
    }
  }

  // A campanha de TEXTO continua exigindo ao menos uma variação. A de template
  // não: o conteúdo está no modelo, e exigir texto faria a tela inventar um.
  if (tipo === "texto") {
    if (mensagens.length === 0) {
      return fail("validation_failed", "Informe a mensagem (ou as variações) do disparo.", 400, {
        requestId,
      });
    }
    for (const [i, m] of mensagens.entries()) {
      const texto = validarMensagem(m);
      if (!texto.ok) {
        const rotulo = mensagens.length > 1 ? `Mensagem ${i + 1}: ` : "";
        return fail("validation_failed", `${rotulo}${texto.erro}`, 400, { requestId });
      }
    }
  }

  // `limite` é `let` porque o TETO DO NÚMERO pode reduzi-lo mais abaixo (o
  // operador pede 50, o número em aquecimento só aceita 20 — vale o menor).
  let limite = entrada.limite ?? LIMITE_PADRAO_DIA;
  const espacoMs = entrada.espaco_ms ?? ESPACO_PADRAO_MS;

  // ─── Sessão utilizável ───────────────────────────────────────────────────
  // `sessaoProntaParaEnvio` cai para uma sessão parada quando não há WORKING —
  // o que é o comportamento certo para ABRIR conversa e o comportamento errado
  // para prometer envio. Aqui a pergunta é "dá para mandar AGORA", e a resposta
  // é só `WORKING` não arquivada.
  const { data: sessoes, error: errSessao } = await admin
    .from("channel_sessions")
    .select("id, provider, status, archived_at, daily_message_limit, quality_rating")
    .eq("organization_id", orgId)
    .eq("status", "WORKING")
    .is("archived_at", null);
  if (errSessao) return fail("internal_error", "Erro ao ler as sessões.", 500, { requestId });
  // A sessão é escolhida pela CAPABILITY, não pela ordem do banco (0284): texto
  // livre e modelo aprovado são canais diferentes, e pegar a primeira WORKING
  // podia pôr uma campanha de texto no número oficial — aceita pela API e
  // recusada na entrega (131047). A 0286 acrescenta o veto por QUALIDADE: um
  // número em RED existe, é compatível, e mesmo assim não deve receber.
  const sessao = escolherSessaoDaCampanha(
    (sessoes ?? []) as unknown as SessaoDaCampanha[],
    tipo,
  );
  const sessaoWorking = sessao !== null;
  // `null` por falta de canal ou por qualidade RED são problemas diferentes —
  // e o operador precisa saber qual dos dois está olhando.
  const bloqueadaPorQualidadeAgora =
    !sessao && bloqueadaPorQualidade((sessoes ?? []) as unknown as SessaoDaCampanha[], tipo);

  // ─── Prospects + contexto ────────────────────────────────────────────────
  // `prospect_ids` aceita até 2.000 (o teto do disparo em lote). Em fatias de
  // 100: 500 UUIDs numa URL dão 18.499 bytes e o PostgREST responde
  // `414 URI too long` — a tela via "Erro ao ler os prospects" com o banco são.
  let erroProspects: unknown = null;
  const { linhas, falhas: falhasProspects } = await porFatias(
    entrada.prospect_ids,
    async (fatia) => {
      const r = await admin
        .from("business_prospects")
        .select(
          "id, nome, telefone_normalizado, do_not_contact, bloqueado, whatsapp_potencial, status_comercial, contact_id, categoria, categorias, website, categoria_canonica, categoria_revisar, cidade",
        )
        .eq("organization_id", orgId)
        .in("id", fatia)
        .limit(2000);
      if (r.error && !erroProspects) erroProspects = r.error;
      return { linhas: (r.data ?? []) as never[], erro: r.error };
    },
  );
  if (falhasProspects > 0) {
    logger.error("[prospecting.disparar] falha ao ler os prospects", {
      requestId,
      organization_id: orgId,
      erro: erroProspects,
    });
    return fail("internal_error", "Erro ao ler os prospects.", 500, { requestId });
  }

  const brutos = (linhas ?? []) as Array<{
    id: string;
    nome: string | null;
    telefone_normalizado: string | null;
    do_not_contact: boolean;
    bloqueado: boolean;
    whatsapp_potencial: boolean;
    status_comercial: string;
    contact_id: string | null;
    categoria: string | null;
    categorias: string[] | null;
    website: string | null;
    categoria_canonica: string | null;
    categoria_revisar: boolean | null;
    cidade: string | null;
  }>;
  if (brutos.length === 0) {
    return fail("not_found", "Nenhum dos prospects pertence a esta organização.", 404, { requestId });
  }

  const contactIds = [...new Set(brutos.map((p) => p.contact_id).filter((c): c is string => !!c))];

  const porContato = await contextoDosContatos(admin, orgId, contactIds);

  // ─── Exclusividade da campanha (0277) ────────────────────────────────────
  // `idsReservadosPorOutras` traz a lista fechada e o ledger de TODAS as outras
  // campanhas da organização. Se a empresa já está numa, ela não recebe por
  // esta — e o motivo chega à tela com nome, não como erro de unique.
  const reservadosPorOutras = await idsReservadosPorOutras(admin, orgId, campanha?.id ?? null);
  const jaEnviadosNesta = new Set<string>();
  if (campanha) {
    const { data: enviadasNesta } = await admin
      .from("prospecting_sends")
      .select("prospect_id")
      .eq("organization_id", orgId)
      .eq("campaign_id", campanha.id);
    for (const linha of (enviadasNesta ?? []) as Array<{ prospect_id: string }>) {
      jaEnviadosNesta.add(linha.prospect_id);
    }
  }
  const categoriasDaCampanha = campanha?.categorias ?? [];
  /**
   * 0285 — a categoria DA CAMPANHA que casou com cada empresa. É a chave usada
   * para escolher o modelo no envio; `null` significa recorte vazio/curinga e
   * usa o bind legado.
   */
  const categoriaDaCampanhaPorProspect = new Map(
    brutos.map((p) => [p.id, categoriaDaCampanhaQueCombina(categoriaEfetiva(p), categoriasDaCampanha)]),
  );

  // ─── As DUAS cotas do dia ────────────────────────────────────────────────
  // A que o operador pede (`limite`) e o TETO DO NÚMERO — `daily_message_limit`
  // ∩ o warm-up da idade, a MESMA régua que o motor anti-ban impõe ao agente de
  // IA. Vale a MENOR. Um disparo que passasse por cima do warm-up mandaria 50
  // mensagens por um número no dia em que o próprio produto diz que 20 é o
  // seguro, e o banimento cairia na linha da empresa — não na campanha.
  //
  // `jaEnviadosHoje` sai da MESMA leitura: `pacing_ledger` é quem conta envio de
  // verdade (o `channel_session_warmup` não tem escritor — ver
  // `lib/automation/throttle.ts`), e o dia começa na meia-noite LOCAL, igual ao
  // `sentToday` que o agente vê.
  // O fuso da organização serve às duas réguas que dependem de "que dia é hoje"
  // (`lerTetoDoNumero`) e à mensagem da trava ocupada. Uma leitura só.
  const fusoDoEnvio = await lerFusoDaOrganizacao(admin, orgId);
  let jaEnviadosHoje = 0;
  if (sessao) {
    const { teto, enviadosHoje } = await lerTetoDoNumero(admin, {
      orgId,
      sessaoId: sessao.id,
      agoraIso: new Date().toISOString(),
      fuso: fusoDoEnvio,
      limiteDoCrm: sessao.daily_message_limit,
    });
    jaEnviadosHoje = enviadosHoje;
    limite = Math.min(limite, teto);
  }

  const candidatos: CandidatoAoDisparo[] = brutos.map((p) => {
    const ctx = p.contact_id ? porContato.get(p.contact_id) : undefined;
    const efetiva = categoriaEfetiva(p);
    const incompativel =
      !efetiva.revisar &&
      categoriasDaCampanha.length > 0 &&
      !categoriaCombinaComCampanha(efetiva, categoriasDaCampanha);
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
      emOutraCampanha: reservadosPorOutras.has(p.id),
      categoriaRevisar: efetiva.revisar,
      categoriaIncompativel: incompativel,
      jaEnviado: jaEnviadosNesta.has(p.id),
    };
  });

  const plano = planejarDisparo(candidatos, {
    limite,
    jaEnviadosHoje,
    espacoMs,
    sessaoWorking,
    // Template não rotaciona: é o mesmo modelo para todos. O planejador já
    // protege contra zero, mas declarar 1 deixa o plano honesto.
    quantidadeDeMensagens: tipo === "template" ? 1 : mensagens.length,
  });

  const resumo = {
    simulacao: entrada.dry_run,
    /** 0284 — o que vai sair: texto livre ou o modelo aprovado. */
    mensagem_tipo: tipo,
    template: templateDoEnvio
      ? { name: templateDoEnvio.name, language: templateDoEnvio.language }
      : null,
    // 0285 — a simulação mostra o modelo de cada categoria. Sem isso, o
    // operador revisa "Modelo: x" e não vê que restaurante sairia com outro.
    templates_por_categoria: binds.map((b) => ({
      categoria: b.categoria,
      name: b.name,
      language: b.language,
    })),
    pode_enviar: plano.podeEnviar,
    bloqueio: bloqueadaPorQualidadeAgora ? "numero_qualidade_red" : plano.bloqueio,
    selecionados: entrada.prospect_ids.length,
    encontrados: brutos.length,
    serao_enviados: plano.aprovados.length,
    serao_recusados: plano.recusados.length,
    estouraram_a_cota: plano.estouraramACota,
    ja_enviados_hoje: jaEnviadosHoje,
    limite,
    espaco_ms: espacoMs,
    duracao_prevista_ms: plano.duracaoPrevistaMs,
    // A rotação é o que o operador precisa conferir antes de mandar: quantas
    // variações vão alternar e em que ordem. Sem isso, três textos na tela
    // viram uma promessa que ninguém pode checar.
    variacoes: plano.variacoes,
    rotacao: plano.aprovados.slice(0, 12).map((a) => a.mensagem_indice + 1),
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
      bloqueadaPorQualidadeAgora
        ? "O número oficial está com qualidade RED na Meta. O envio foi recusado para não piorar a avaliação do número. Revise o conteúdo e o público dos últimos envios; quando a qualidade voltar para GREEN, envie de novo. Nada foi enviado."
        : tipo === "template"
          ? "Nenhum canal oficial WORKING que aceite template. Conecte o número oficial em Conexões. Nada foi enviado."
          : "Nenhum canal WORKING que aceite texto livre. Conecte um número por QR ou use uma campanha por template. Nada foi enviado.",
      409,
      { requestId, details: { plano: resumo } },
    );
  }
  if (plano.aprovados.length === 0) {
    return fail(
      "state_conflict",
      "Nenhuma empresa da seleção pode receber agora. Nada foi enviado.",
      409,
      { requestId, details: { plano: resumo } },
    );
  }

  // A campanha é obrigatória no envio real — checado acima. O `!` é o registro
  // de que o TS não consegue ver a relação entre as duas checagens.
  const campanhaDoEnvio = campanha!;

  // ─── A TRAVA do NÚMERO, antes de reservar ────────────────────────────────
  // Um "Enviar agora" por número, de cada vez (0288). O ritmo do plano mora num
  // `Map` de memória, que só enxerga o próprio processo e só funciona para UMA
  // requisição por vez: três cliques simultâneos leem o "último envio" antes de
  // qualquer um gravar e as três mandam juntas. Medido em 26/10/2026: ~3
  // mensagens por minuto com a tela prometendo 2 min.
  //
  // A trava vem ANTES da reserva do ledger de propósito: reservar e depois ser
  // recusado deixaria as empresas marcadas como enviadas (`prospecting_sends` é
  // único por organização) sem nunca terem recebido — e nenhuma campanha
  // conseguiria mandar para elas depois.
  const validadeMs = validadeDaTrava(espacoMs, plano.aprovados.length);
  const trava = await travarDisparo(admin, { orgId, sessaoId: sessao!.id, validadeMs });
  if (!trava.ok) {
    return fail(
      "conflict",
      trava.ocupadaAte
        ? `Este número já está enviando outro lote (até ${horaNoFuso(trava.ocupadaAte, fusoDoEnvio)}). Espere esse envio terminar para não mandar duas mensagens no mesmo minuto. Nada foi enviado agora.`
        : "Este número já está enviando outro lote neste momento. Espere esse envio terminar para não mandar duas mensagens no mesmo minuto. Nada foi enviado agora.",
      409,
      { requestId, details: { plano: resumo, ocupado_ate: trava.ocupadaAte } },
    );
  }

  try {
    // ─── A RESERVA da lista, antes do envio ──────────────────────────────────
    // A lista fechada da campanha é o que faz a empresa parar de aparecer "em
    // aberto" para a próxima. Grava a UNIÃO com o que já estava lá; o trigger
    // 0277 recusa sobreposição com outra campanha (corrida que a nossa leitura
    // não pegou também cai aqui).
    const idsAprovados = new Set(plano.aprovados.map((a) => a.id));
    const paraReservar = brutos.map((p) => p.id).filter((id) => idsAprovados.has(id));
    const listaAtual = new Set(campanhaDoEnvio.prospect_ids ?? []);
    const listaNova = [...listaAtual];
    for (const id of paraReservar) {
      if (!listaAtual.has(id)) {
        listaAtual.add(id);
        listaNova.push(id);
      }
    }
    if (paraReservar.length > 0) {
      const { error: errLista } = await admin
        .from("prospecting_campaigns")
        .update({ prospect_ids: listaNova })
        .eq("id", campanhaDoEnvio.id)
        .eq("organization_id", orgId);
      if (errLista) {
        if (
          errLista.code === "23505" ||
          errLista.message.includes("prospect_em_outra_campanha") ||
          errLista.message.includes("contato_em_outra_campanha")
        ) {
          return fail(
            "state_conflict",
            "Uma ou mais empresas já foram reservadas por outra campanha. Nada foi enviado.",
            409,
            { requestId, details: { plano: resumo } },
          );
        }
        logger.error("[disparo] falha ao reservar a lista da campanha", {
          requestId,
          organization_id: orgId,
          erro: errLista.message,
        });
        return fail("internal_error", "Erro ao reservar as empresas da campanha.", 500, { requestId });
      }
    }

    // ─── A reserva do LEDGER, antes de mandar ────────────────────────────────
    // A unique global (organization_id, prospect_id) é a trava de envio: se
    // outra campanha reservou a mesma empresa entre a leitura e agora, o
    // `ignoreDuplicates` devolve menos linhas e o plano encolhe. Nada é enviado
    // sem reserva — nem duas vezes, nem por duas campanhas.
    const agoraIso = new Date().toISOString();
    const { data: reservadas, error: errReserva } = await admin
      .from("prospecting_sends")
      .upsert(
        plano.aprovados.map((a) => ({
          organization_id: orgId,
          campaign_id: campanhaDoEnvio.id,
          prospect_id: a.id,
          mensagem_indice: a.mensagem_indice,
          message_id: null,
          enviado_em: agoraIso,
        })),
        { onConflict: "organization_id,prospect_id", ignoreDuplicates: true },
      )
      .select("prospect_id");
    if (errReserva) {
      logger.error("[disparo] falha ao reservar o ledger", {
        requestId,
        organization_id: orgId,
        erro: errReserva.message,
      });
      return fail("internal_error", "Erro ao reservar os envios.", 500, { requestId });
    }
    const reservadosAgora = new Set(
      ((reservadas ?? []) as Array<{ prospect_id: string }>).map((r) => r.prospect_id),
    );
    const planoReservado = {
      ...plano,
      aprovados: plano.aprovados.filter((a) => reservadosAgora.has(a.id)),
    };
    const perdidasNaCorrida = plano.aprovados.length - planoReservado.aprovados.length;
    if (planoReservado.aprovados.length === 0) {
      return fail(
        "state_conflict",
        "As empresas da seleção já foram reservadas por outro envio. Nada foi enviado.",
        409,
        { requestId, details: { plano: resumo } },
      );
    }
    const resumoFinal = {
      ...resumo,
      serao_enviados: planoReservado.aprovados.length,
      duracao_prevista_ms: planoReservado.duracaoPrevistaMs,
      rotacao: planoReservado.aprovados.slice(0, 12).map((a) => a.mensagem_indice + 1),
      reservadas_na_corrida: perdidasNaCorrida,
    };

    // Os dados que os tokens do modelo interpolam por empresa. `categoria` é a
    // EFETIVA (o rótulo que a tela mostra), não o cru do Google — mandar o cru
    // seria mandar ao cliente o nome errado do próprio negócio.
    const dadosPorProspect = new Map(
      brutos.map((p) => [
        p.id,
        {
          cidade: p.cidade,
          categoria: categoriaEfetiva(p).rotulo,
          categoria_campanha: categoriaDaCampanhaPorProspect.get(p.id) ?? null,
        },
      ]),
    );

    // O tick do agendamento e um disparo anterior também falam por este número.
    // `pacing_ledger` é a memória DURÁVEL do último envio (o `Map` acima morre no
    // restart): sem esta leitura, o primeiro item do lote sairia no mesmo minuto
    // em que o tick acabou de falar — a rajada que a trava existe para evitar, só
    // que entre as duas portas do disparo.
    const ultimoDoNumero = await lerUltimoEnvioDoNumero(admin, orgId, sessao!.id);
    if (ultimoDoNumero !== null) {
      _ultimoEnvio.set(sessao!.id, Math.max(_ultimoEnvio.get(sessao!.id) ?? 0, ultimoDoNumero));
    }

    const resultado = await enviarPlano({
      admin,
      orgId,
      usuarioId,
      requestId,
      sessaoId: sessao!.id,
      espacoMs,
      mensagens,
      template: templateDoEnvio,
      templatesPorCategoria,
      dadosPorProspect,
      plano: planoReservado,
      campaignId: campanhaDoEnvio.id,
    });

    return ok({ plano: resumoFinal, resultado }, { requestId });
  } finally {
    // Solta SEMPRE — inclusive nos 409 de reserva e nos erros. O lease vence
    // sozinho no pior caso, mas deixar o número travado por minutos depois de um
    // erro é o tipo de coisa que só aparece quando o operador precisa enviar.
    await soltarDisparo(admin, { orgId, sessaoId: sessao!.id, token: trava.trava.token });
  }
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

  const { linhas: contatos } = await porFatias(contactIds, async (fatia) => {
    const r = await admin
      .from("contacts")
      .select("id, is_blocked, consent")
      .eq("organization_id", orgId)
      .in("id", fatia)
      .limit(2000);
    return { linhas: (r.data ?? []) as never[], erro: r.error };
  });
  for (const c of contatos as Array<{
    id: string;
    is_blocked: boolean;
    consent: { marketing?: { declined_at?: string | null } | null } | null;
  }>) {
    saida.set(c.id, {
      is_blocked: c.is_blocked,
      declined_at: c.consent?.marketing?.declined_at ?? null,
      conversaAberta: false,
      mensagemRecente: false,
    });
  }
  if (saida.size === 0) return saida;

  const { linhas: conversas } = await porFatias(contactIds, async (fatia) => {
    const r = await admin
      .from("conversations")
      .select("contact_id, status")
      .eq("organization_id", orgId)
      .in("contact_id", fatia)
      .in("status", STATUS_DE_CONVERSA_ABERTA)
      .limit(5000);
    return { linhas: (r.data ?? []) as never[], erro: r.error };
  });
  for (const cv of conversas as Array<{ contact_id: string | null }>) {
    if (!cv.contact_id) continue;
    const c = saida.get(cv.contact_id);
    if (c) c.conversaAberta = true;
  }

  const desde = new Date(Date.now() - COOLDOWN_HORAS * 3_600_000).toISOString();
  const { linhas: recentes } = await porFatias(contactIds, async (fatia) => {
    const r = await admin
      .from("messages")
      .select("contact_id")
      .eq("organization_id", orgId)
      .eq("direction", "outbound")
      .in("contact_id", fatia)
      .gte("created_at", desde)
      .limit(5000);
    return { linhas: (r.data ?? []) as never[], erro: r.error };
  });
  for (const m of recentes as Array<{ contact_id: string | null }>) {
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
 * O fuso da organização — a régua de "que dia é hoje" das cotas e o horário que
 * a mensagem de trava ocupada mostra. Não lança: sem fuso, o dia cai no UTC do
 * banco, que é conservador para a cota (nunca a libera cedo) e legível na tela.
 */
async function lerFusoDaOrganizacao(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("organizations")
    .select("timezone")
    .eq("id", orgId)
    .maybeSingle();
  return (data as { timezone?: string | null } | null)?.timezone ?? null;
}

/**
 * "até 14:32" no fuso da organização — nunca em UTC de servidor.
 *
 * O idioma vem de `tagDeIdioma` e não de um "pt-BR" escrito aqui: a data segue
 * quem lê (`tests/unit/i18n-a-data-segue-o-idioma.test.ts`). A mensagem da rota
 * é do servidor, então usa o idioma padrão do produto.
 */
function horaNoFuso(iso: string, fuso: string | null): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "mais tarde";
  const idioma = tagDeIdioma(IDIOMA_PADRAO);
  const opcoes: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  try {
    return data.toLocaleTimeString(idioma, { ...opcoes, timeZone: fuso ?? undefined });
  } catch {
    // Fuso inválido no banco não pode virar 500 no meio da recusa.
    return data.toLocaleTimeString(idioma, opcoes);
  }
}

/**
 * O último envio DESTE número, de qualquer porta (campanha, tick, agente).
 *
 * O ritmo do lote é um `Map` de memória, então um deploy no meio da campanha o
 * zera. Ler `pacing_ledger` antes do primeiro item faz o lote esperar o intervalo
 * que a tela promete, em vez de falar por cima do tick que acabou de mandar.
 */
async function lerUltimoEnvioDoNumero(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  sessaoId: string,
): Promise<number | null> {
  const { data } = await admin
    .from("pacing_ledger")
    .select("sent_at")
    .eq("organization_id", orgId)
    .eq("channel_session_id", sessaoId)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const iso = (data as { sent_at?: string } | null)?.sent_at;
  const ms = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(ms) ? ms : null;
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
  /** As variações de texto; cada envio pega a sua pelo `mensagem_indice`. */
  mensagens: string[];
  /** 0284 — quando presente, o envio é template e ignora `mensagens`. */
  template: TemplateDoEnvio | null;
  /** 0285 — modelo por categoria; vazio = o bind único acima vale para todos. */
  templatesPorCategoria: Map<string, TemplateDoEnvio>;
  /** Cidade e categoria efetiva por prospect, para os tokens do modelo. */
  dadosPorProspect: Map<
    string,
    { cidade: string | null; categoria: string | null; categoria_campanha: string | null }
  >;
  plano: ReturnType<typeof planejarDisparo>;
  /** A campanha do disparo — o ledger já foi reservado com ela (0277). */
  campaignId: string;
}

/**
 * Executa o plano. Um por um, no ritmo que a simulação prometeu.
 *
 * Quatro decisões que valem o comentário:
 *
 * 1. **Um por um, sem `Promise.all`.** Mandar 500 de uma vez é o padrão que
 *    ban. O ritmo é o plano, e o plano é sequencial.
 * 2. **Falha de um não derruba os outros.** Um número rejeitado pelo canal não
 *    pode impedir a campanha inteira — quem manda em lote precisa do relatório
 *    do que deu errado, não de um 500 no meio.
 * 3. **O contato é resolvido por telefone.** O prospect pode não terido contato
 *    ainda: `fn_upsert_wa_contact` cria, e é o mesmo caminho que a entrada
 *    usa — não há segunda forma de "criar contato" neste produto.
 * 4. **A variação vem do PLANO.** `item.mensagem_indice`, não um contador
 *    daqui: a simulação e o envio contam a mesma história, e uma mensagem que
 *    falhou não desloca a rotação de quem vem depois.
 */
async function enviarPlano(p: ParamsDoEnvio) {
  const enviados: Array<{ nome: string; message_id: string; status: string }> = [];
  const falhas: Array<{ nome: string; erro: string }> = [];

  for (const item of p.plano.aprovados) {
    await esperar(p.sessaoId, p.espacoMs);

    // 0285 — o modelo é escolhido POR EMPRESA, pela categoria da campanha que
    // casou com ela. Sem recorte/curinga, vale o bind padrão. Categoria sem
    // modelo não cai no modelo de outra categoria: falha nomeada, e a empresa
    // não recebe o texto errado.
    const dadosDoProspect = p.dadosPorProspect.get(item.id);
    const categoriaDaCampanha = dadosDoProspect?.categoria_campanha ?? null;
    const templateDoItem =
      p.templatesPorCategoria.size > 0 && categoriaDaCampanha
        ? (p.templatesPorCategoria.get(chaveDaCategoria(categoriaDaCampanha)) ?? null)
        : p.template;
    if (p.templatesPorCategoria.size > 0 && categoriaDaCampanha && !templateDoItem) {
      falhas.push({
        nome: item.nome,
        erro: `A categoria "${categoriaDaCampanha}" não tem modelo configurado.`,
      });
      continue;
    }

    // O envio é compartilhado com o AGENDAMENTO (`lib/prospeccao/envio.ts`):
    // upsert do contato → conversa → `sendMessageHandler`. Um segundo caminho
    // de envio no produto é onde os guardrails divergem e o número queima.
    const resultado = await enviarParaProspect(p.admin, {
      orgId: p.orgId,
      usuarioId: p.usuarioId,
      requestId: p.requestId,
      sessaoId: p.sessaoId,
      prospect: {
        id: item.id,
        nome: item.nome,
        telefone_normalizado: item.telefone_normalizado,
        cidade: dadosDoProspect?.cidade ?? null,
        categoria: dadosDoProspect?.categoria ?? null,
      },
      mensagem: templateDoItem ? "" : mensagemDaVez(p.mensagens, item.mensagem_indice),
      template: templateDoItem,
    });
    if (resultado.ok) {
      enviados.push({ nome: item.nome, message_id: resultado.messageId, status: resultado.status });
      // A reserva nasceu com `message_id` nulo; o comprovante chega depois do
      // envio. Falhar aqui não desfaz a mensagem — só deixa o comprovante
      // pendente, e o log diz onde procurar.
      const { error: errComprovante } = await p.admin
        .from("prospecting_sends")
        .update({ message_id: resultado.messageId })
        .eq("organization_id", p.orgId)
        .eq("campaign_id", p.campaignId)
        .eq("prospect_id", item.id);
      if (errComprovante) {
        logger.warn("disparo: envio saiu, comprovante não gravado", {
          prospectId: item.id,
          campaignId: p.campaignId,
          erro: errComprovante.message,
          requestId: p.requestId,
        });
      }
    } else {
      falhas.push({ nome: item.nome, erro: resultado.erro });
      logger.error("disparo: envio falhou", {
        prospectId: item.id,
        erro: resultado.erro,
        requestId: p.requestId,
      });
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
