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
 *      operador achar que "não mandou" quando já mandou tudo. São DUAS cotas, e
 *      a MENOR manda: a da campanha (`limite_diario`) e a do NÚMERO (o teto do
 *      CRM ∩ o warm-up da idade) — a mesma régua que o agente de IA obedece.
 *      Sem a segunda, a campanha furaria o aquecimento do próprio número que o
 *      produto se compromete a proteger, e quem leva o banimento é o WhatsApp
 *      da empresa.
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

import { normalizaTelefone } from "@/lib/contacts/csv";
import {
  avaliarTemplateParaCampanha,
  carregarTemplateParaCampanha,
  type TemplateParaCampanha,
} from "@/lib/channels/templates/para-campanha";
import { logger } from "@/lib/logger";
import {
  bloqueadaPorQualidade,
  escolherSessaoDaCampanha,
  type SessaoDaCampanha,
} from "@/lib/prospeccao/canal-da-campanha";
import {
  categoriaCombinaComCampanha,
  categoriaDaCampanhaQueCombina,
  categoriaEfetiva,
} from "@/lib/prospeccao/categoria-efetiva";
import { mensagemDaVez } from "@/lib/prospeccao/disparo";
import { enviarParaProspect, type ProspectParaEnvio } from "@/lib/prospeccao/envio";
import type { TipoDaMensagem } from "@/lib/prospeccao/mensagem-da-campanha";
import {
  lerTemplatesPorCategoria,
  templateDaCategoria,
  type TemplateDaCategoria,
} from "@/lib/prospeccao/templates-por-categoria";
import { fusoSeguro, relogioNoFuso } from "@/lib/venda-automatica/janela";

import {
  inicioDoDiaNoFuso,
  podeEnviarAgora,
  type JanelaDoDia,
  type MotivoDeEspera,
} from "./agendamento";
import { lerTetoDoNumero } from "./teto-do-numero";

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
  /** Campanha de texto e nenhum canal WORKING permite texto livre. */
  | "sem_canal_texto"
  /** Campanha de template e nenhum canal WORKING aceita modelo aprovado. */
  | "sem_canal_template"
  /** 0286 — o canal existe, mas o número oficial está com qualidade RED. */
  | "numero_qualidade_red"
  | "template_invalido"
  /** 0285 — a categoria do prospect não tem modelo configurado na campanha. */
  | "template_da_categoria_ausente"
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
  /** A audiência: `prospects` (default) ou `contatos` (recuperação, 0274). */
  publico: string | null;
  prospect_ids: string[] | null;
  contato_ids: string[] | null;
  /** O recorte de categoria da campanha (0277) — vazio/`empresas` = sem filtro. */
  categorias: string[] | null;
  mensagens: string[] | null;
  /** 0284 — como a campanha fala. Ausente em linha antiga = `texto`. */
  mensagem_tipo: string | null;
  template_name: string | null;
  template_language: string | null;
  template_contract_hash: string | null;
  template_values: Record<string, string> | null;
  /** 0285 — um bind por categoria. Vazio = bind legado (0284). */
  templates_por_categoria: unknown;
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
  categoria: string | null;
  categorias: string[] | null;
  website: string | null;
  categoria_canonica: string | null;
  categoria_revisar: boolean | null;
  cidade: string | null;
}

interface EstadoDaOrg {
  fuso: string;
  /** TODAS as sessões WORKING — o tipo da campanha escolhe uma delas. */
  sessoes: SessaoDaCampanha[];
}

interface EstadoDaSessao {
  /** `sent_at` mais recente em `pacing_ledger` desta sessão (ms). */
  ultimoEnvioMs: number | null;
  /**
   * O TETO DIÁRIO DO NÚMERO: `channel_sessions.daily_message_limit` ∩ o degrau
   * de warm-up da idade do número. `Infinity` = número formado.
   *
   * É a mesma régua que `decidePacing` aplica ao agente de IA — uma campanha
   * que mandasse mais do que o teto do número furaria o warm-up que o produto
   * promete respeitar, e o banimento cairia no WhatsApp da empresa.
   */
  tetoDoNumero: number;
  /**
   * Envios de HOJE pelo número, de QUALQUER origem (campanhas + agente de IA) —
   * é o `sentToday` do pacing, lido do `pacing_ledger` no início do tick. Não é
   * somado durante o tick porque a trava de ritmo acima já garante uma única
   * mensagem por número por passada; um envio deste tick aparece nesta conta na
   * passada seguinte.
   */
  enviadosHojeDoNumero: number;
}

const COLUNAS =
  "id, organization_id, nome, publico, prospect_ids, contato_ids, categorias, mensagens, " +
  "mensagem_tipo, template_name, template_language, template_contract_hash, template_values, " +
  "templates_por_categoria, espaco_ms, limite_diario, data_inicio, data_fim, janelas, ultimo_envio_at";

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

  // O fuso e as sessões são da ORG; o ritmo é da SESSÃO. Uma campanha de texto
  // e uma de template podem usar números diferentes na mesma organização — e
  // cada número tem o seu `pacing_ledger`. Guardar o ritmo por org faria a
  // segunda campanha achar que o primeiro número já falou, ou pior, deixaria
  // de respeitar o espaçamento do número que ela mesma usa.
  const orgs = new Map<string, EstadoDaOrg>();
  const estadoDaOrg = async (orgId: string): Promise<EstadoDaOrg> => {
    const memo = orgs.get(orgId);
    if (memo) return memo;
    const estado = await carregarEstadoDaOrg(admin, orgId);
    orgs.set(orgId, estado);
    return estado;
  };

  const ritmos = new Map<string, EstadoDaSessao>();
  const estadoDaSessao = async (
    orgId: string,
    sessao: SessaoDaCampanha,
    fuso: string,
  ): Promise<EstadoDaSessao> => {
    const chave = `${orgId}:${sessao.id}`;
    const memo = ritmos.get(chave);
    if (memo) return memo;
    const estado = await carregarEstadoDaSessao(admin, orgId, sessao, fuso, agoraIso);
    ritmos.set(chave, estado);
    return estado;
  };

  for (const campanha of lista) {
    resumo.campanhas++;
    try {
      // A lista fechada vem da coluna da AUDIÊNCIA: prospecção lê
      // `prospect_ids`, recuperação lê `contato_ids` (0274). Ler a coluna
      // errada mandaria para a empresa errada — ou não mandaria para ninguém.
      const publico = campanha.publico === "contatos" ? "contatos" : "prospects";
      const listaFechada = (
        (publico === "contatos" ? campanha.contato_ids : campanha.prospect_ids) ?? []
      ).filter((id) => id.trim() !== "");
      if (listaFechada.length === 0) continue; // nada a mandar — não é "pulo", é campanha vazia

      const org = await estadoDaOrg(campanha.organization_id);
      if (org.sessoes.length === 0) {
        resumo.pulados.push({ campanha: campanha.id, motivo: "sem_sessao" });
        continue;
      }

      // 0284 — a campanha DECLARA como fala; o canal responde se pode. Nunca
      // `if (provider === ...)`: a pergunta é capability (invariante 1 da
      // doutrina de restrição de canal).
      const tipo: TipoDaMensagem =
        campanha.mensagem_tipo === "template" ? "template" : "texto";
      const sessao = escolherSessaoDaCampanha(org.sessoes, tipo);
      if (!sessao) {
        // 0286 — dois desfechos diferentes, dois próximos passos diferentes.
        // Se o canal existe e foi recusado pela qualidade, o problema não é
        // conexão: é reputação. Dizer "conecte um número" aqui mandaria o
        // operador refazer uma conexão que já está de pé.
        if (bloqueadaPorQualidade(org.sessoes, tipo)) {
          const erro =
            "O número oficial está com qualidade RED na Meta. A campanha foi pausada para não piorar a avaliação do número. " +
            "Revise o conteúdo e o público dos últimos envios; quando a qualidade voltar para GREEN, retome a campanha.";
          await registrarErroDaCampanha(admin, campanha, erro, agoraIso, true);
          resumo.pausadas++;
          resumo.pulados.push({ campanha: campanha.id, motivo: "numero_qualidade_red" });
          continue;
        }
        const motivo = tipo === "template" ? "sem_canal_template" : "sem_canal_texto";
        const erro =
          tipo === "template"
            ? "Nenhum canal oficial WORKING para enviar template. Conecte o número oficial em Conexões."
            : "Nenhum canal WORKING que aceite texto livre. Conecte um número por QR ou use uma campanha por template.";
        await registrarErroDaCampanha(admin, campanha, erro, agoraIso, false);
        resumo.pulados.push({ campanha: campanha.id, motivo });
        continue;
      }
      const ritmo = await estadoDaSessao(campanha.organization_id, sessao, org.fuso);

      // O ledger diz quem JÁ recebeu e quando — idempotência e cota do dia
      // saem da MESMA leitura. Desde a 0277 ele é GLOBAL por organização: um
      // prospect enviado por OUTRA campanha também sai desta lista. Sem isso,
      // a segunda campanha escolheria a empresa de novo e a unique global
      // faria o tick reservar nada — a campanha ficaria presa no mesmo ponto.
      const { data: linhasEnviadas } = await admin
        .from("prospecting_sends")
        .select("prospect_id, campaign_id, enviado_em")
        .eq("organization_id", campanha.organization_id);
      const todasEnviadas = (linhasEnviadas ?? []) as unknown as Array<{
        prospect_id: string;
        campaign_id: string;
        enviado_em: string;
      }>;
      const enviadas = todasEnviadas.filter((l) => l.campaign_id === campanha.id);
      const jaEnviados = new Set(todasEnviadas.map((l) => l.prospect_id));
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
        ritmo.ultimoEnvioMs !== null &&
        Date.parse(agoraIso) - ritmo.ultimoEnvioMs < espacoMs
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
      // Template NÃO usa a rotação de texto. A exigência de mensagem é do
      // caminho `texto`; cobrar as duas faria a campanha de modelo parar com
      // "sem_mensagem" mesmo tendo um modelo completo.
      if (tipo === "texto" && mensagens.length === 0) {
        await registrarErroDaCampanha(
          admin,
          campanha,
          "A campanha não tem nenhuma mensagem de texto salva. Edite e salve ao menos uma variação.",
          agoraIso,
          false,
        );
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
        enviadosHojeDoNumero: ritmo.enviadosHojeDoNumero,
        tetoDoNumero: ritmo.tetoDoNumero,
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

      // ── O modelo, conferido DEPOIS de escolher quem recebe (0285) ────────
      // Com um modelo por categoria, só dá para saber QUAL bind validar
      // depois de escolher a empresa: a categoria efetiva dela decide o
      // modelo. A validação continua ANTES da reserva — modelo inválido não
      // gasta uma linha do ledger por prospect.
      //
      // O PRIMEIRO da lista fechada que ainda não recebeu — e que passa na
      // elegibilidade (sem telefone/opt-out/bloqueado/cliente, na prospecção;
      // sem telefone, na recuperação). Sem a elegibilidade, o agendamento
      // mandaria para quem o disparo manual recusa.
      //
      // Em fatias: os primeiros da lista podem ser todos inelegíveis, e desistir
      // na primeira fatia deixaria a campanha parada com gente elegível logo
      // adiante. O teto é 5 fatias — o tick tem 60 segundos.
      let escolhido: ProspectParaEnvio | null = null;
      const TETO_ELEGIVEL = MAX_PROSPECTS_POR_TICK * 5;
      for (let i = 0; i < restantes.length && i < TETO_ELEGIVEL; i += MAX_PROSPECTS_POR_TICK) {
        escolhido = await escolherDaAudiencia(
          admin,
          campanha.organization_id,
          restantes.slice(i, i + MAX_PROSPECTS_POR_TICK),
          publico,
          publico === "contatos" ? [] : (campanha.categorias ?? []),
        );
        if (escolhido) break;
      }
      if (!escolhido) {
        resumo.pulados.push({ campanha: campanha.id, motivo: "sem_prospect_elegivel" });
        continue;
      }

      // ── O bind da categoria da empresa (0285) ───────────────────────────
      // `templates_por_categoria` vazio é a campanha da 0284: um modelo só.
      // Com mapeamento, categoria sem bind NÃO cai no modelo de outra
      // categoria — a campanha pausa com o motivo visível, porque mandar o
      // texto errado é pior que não mandar.
      const binds = lerTemplatesPorCategoria(campanha.templates_por_categoria);
      let bindDoEnvio: TemplateDaCategoria | null = null;
      if (tipo === "template") {
        const categoriaDaEmpresa = escolhido.categoria_campanha ?? null;
        if (binds.length > 0 && categoriaDaEmpresa !== null) {
          bindDoEnvio = templateDaCategoria(binds, categoriaDaEmpresa);
          if (!bindDoEnvio) {
            await registrarErroDaCampanha(
              admin,
              campanha,
              `A categoria "${categoriaDaEmpresa}" não tem modelo configurado nesta campanha. Edite a campanha e escolha o modelo dessa categoria.`,
              agoraIso,
              true,
            );
            resumo.pausadas++;
            resumo.pulados.push({
              campanha: campanha.id,
              motivo: "template_da_categoria_ausente",
            });
            continue;
          }
        } else {
          // Recorte vazio ou curinga histórico "empresas": o bind legado é o
          // padrão declarado pela campanha (0284), de propósito.
          bindDoEnvio = {
            categoria: "",
            name: campanha.template_name ?? "",
            language: campanha.template_language ?? "",
            contract_hash: campanha.template_contract_hash ?? "",
            values: campanha.template_values ?? {},
          };
        }
      }

      let templateDoEnvio: {
        name: string;
        language: string;
        contractHash: string;
        values: Record<string, string>;
        components: unknown[];
        parameterFormat: string;
      } | null = null;
      if (tipo === "template" && bindDoEnvio) {
        let modelo: TemplateParaCampanha | null = null;
        try {
          modelo = await carregarTemplateParaCampanha(
            admin,
            campanha.organization_id,
            bindDoEnvio.name,
            bindDoEnvio.language,
          );
        } catch (e) {
          const erro = e instanceof Error ? e.message : "Falha ao ler o espelho de modelos.";
          await registrarErroDaCampanha(admin, campanha, erro, agoraIso, false);
          resumo.pulados.push({ campanha: campanha.id, motivo: "template_invalido" });
          continue;
        }

        const veredito = avaliarTemplateParaCampanha(
          modelo,
          bindDoEnvio.values,
          bindDoEnvio.contract_hash,
        );
        if (!veredito.ok || !veredito.template) {
          await registrarErroDaCampanha(admin, campanha, veredito.erro, agoraIso, veredito.pausar);
          if (veredito.pausar) resumo.pausadas++;
          resumo.pulados.push({ campanha: campanha.id, motivo: "template_invalido" });
          continue;
        }

        templateDoEnvio = {
          name: veredito.template.name,
          language: veredito.template.language,
          contractHash: veredito.template.contractHash,
          values: bindDoEnvio.values,
          components: veredito.template.components,
          parameterFormat: veredito.template.parameterFormat,
        };
      }

      // A rotação CONTINUA de onde parou: o índice é o total de envios da
      // campanha, não zero a cada tick. Template não rotaciona — é sempre o
      // mesmo modelo, e o índice 0 mantém o ledger coerente com o que saiu.
      const indice = tipo === "template" ? 0 : enviadas.length % mensagens.length;
      const mensagem = tipo === "template" ? "" : mensagemDaVez(mensagens, indice);

      // ── A RESERVA, ANTES do envio ────────────────────────────────────────
      // O ledger é a TRAVA, não só o comprovante: a unique GLOBAL
      // (organization_id, prospect_id) com `ignoreDuplicates` faz o INSERT
      // devolver linha para UM tick só — e impede que OUTRA campanha da mesma
      // organização envie para a mesma empresa, mesmo em corrida. Sem isto,
      // dois ticks sobrepostos — o crond NÃO espera o anterior terminar, e um
      // tick com dezenas de campanhas passa de 60s — leriam o mesmo ledger,
      // escolheriam o MESMO prospect e mandariam duas mensagens.
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
          { onConflict: "organization_id,prospect_id", ignoreDuplicates: true },
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
        sessaoId: sessao.id,
        prospect: escolhido,
        mensagem,
        template: templateDoEnvio,
        agoraIso,
      });
      if (!resultado.ok) {
        // A reserva fica (é o registro da tentativa), mas o motivo fica
        // VISÍVEL na campanha: sem isso, uma falha de modelo/canal vira uma
        // fila que não anda e ninguém sabe por quê.
        await registrarErroDaCampanha(admin, campanha, resultado.erro, agoraIso, false);
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
        .update({
          ultimo_envio_at: agoraIso,
          // Um envio que saiu é a prova de que o erro anterior foi resolvido.
          // Manter o banner antigo faria o operador caçar um problema que já
          // não existe.
          ultimo_erro: null,
          ultimo_erro_em: null,
        })
        .eq("id", campanha.id)
        .eq("organization_id", campanha.organization_id);

      // O ritmo passa a valer para a PRÓXIMA campanha deste mesmo tick — é a
      // trava global por número, e ela sozinha já garante UMA mensagem por
      // número em cada tick. O gasto do dia NÃO é somado aqui: quem o carrega
      // adiante é a leitura fresca do `pacing_ledger` no tick seguinte.
      ritmo.ultimoEnvioMs = Date.parse(agoraIso);
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

/** Fuso da org + TODAS as sessões WORKING. A escolha é por campanha. */
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
    .select("id, provider, daily_message_limit, quality_rating")
    .eq("organization_id", orgId)
    .eq("status", "WORKING")
    .is("archived_at", null);
  return { fuso, sessoes: (sessoes ?? []) as unknown as SessaoDaCampanha[] };
}

/**
 * O ritmo, o teto e o gasto do dia de UMA sessão. Separado do estado da org
 * porque a campanha de texto e a de template podem usar números diferentes.
 */
async function carregarEstadoDaSessao(
  admin: SupabaseClient,
  orgId: string,
  sessao: SessaoDaCampanha,
  fuso: string,
  agoraIso: string,
): Promise<EstadoDaSessao> {
  // ── O teto do NÚMERO e o que ele já gastou hoje ─────────────────────────
  // A régua (warm-up ∩ limite do CRM) e a contagem do dia moram em
  // `teto-do-numero.ts`: o "Enviar agora" faz a MESMA pergunta, e duas
  // cópias divergiriam — deixando a outra porta sem teto.
  const { teto, enviadosHoje } = await lerTetoDoNumero(admin, {
    orgId,
    sessaoId: sessao.id,
    agoraIso,
    fuso,
    limiteDoCrm: sessao.daily_message_limit ?? null,
  });

  const { data: ultimo } = await admin
    .from("pacing_ledger")
    .select("sent_at")
    .eq("organization_id", orgId)
    .eq("channel_session_id", sessao.id)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sentAt = (ultimo as { sent_at?: string } | null)?.sent_at;
  const ms = sentAt ? Date.parse(sentAt) : Number.NaN;

  return {
    ultimoEnvioMs: Number.isFinite(ms) ? ms : null,
    tetoDoNumero: teto,
    enviadosHojeDoNumero: enviadosHoje,
  };
}

/**
 * Deixa o motivo na campanha — o invariante 4 do sistema vivo ("nenhuma
 * demanda sem próximo passo") vale também para o que NÃO saiu. `pausar` é
 * usado para erro de configuração (modelo mudou/reprovado, número em RED):
 * insistir a cada minuto só queimaria a fila. Falta de canal NÃO pausa: o
 * número pode voltar.
 *
 * Quando pausa, grava também `pausa_motivo`/`pausa_em` (0286). São colunas
 * separadas de `ultimo_erro` porque respondem a outra pergunta: `ultimo_erro`
 * é "o que deu errado na última tentativa", `pausa_motivo` é "por que esta
 * campanha está parada". O controle mostra a segunda em destaque — e é ela que
 * o PATCH de retomada zera, senão o aviso continuaria na tela depois de a
 * campanha voltar a andar.
 */
async function registrarErroDaCampanha(
  admin: SupabaseClient,
  campanha: { id: string; organization_id: string },
  erro: string,
  agoraIso: string,
  pausar: boolean,
): Promise<void> {
  const texto = erro.slice(0, 2000);
  const { error } = await admin
    .from("prospecting_campaigns")
    .update({
      ultimo_erro: texto,
      ultimo_erro_em: agoraIso,
      ...(pausar ? { status: "pausada", pausa_motivo: texto, pausa_em: agoraIso } : {}),
    })
    .eq("id", campanha.id)
    .eq("organization_id", campanha.organization_id);
  if (error) {
    logger.warn("[prospeccao.agendado] não consegui registrar o erro da campanha", {
      organizationId: campanha.organization_id,
      campaignId: campanha.id,
      erro: error.message,
    });
  }
}

/**
 * A AUDIÊNCIA decide de QUE TABELA sai a próxima mensagem (0274).
 *
 * Prospecção continua igual: `business_prospects`, pulando quem já é cliente
 * (cliente não é alvo de garimpo). Recuperação lê `contacts` — cliente que já
 * comprou e parou — e a única inelegibilidade é não ter telefone: não há
 * opt-out nem bloqueio nesta tabela, e cliente é exatamente quem se quer
 * chamar de volta.
 *
 * As duas devolvem o MESMO `ProspectParaEnvio` (id + nome + telefone), que é o
 * que o envio canônico precisa. O id é o da linha da audiência — é ele que vai
 * para o ledger.
 */
async function escolherDaAudiencia(
  admin: SupabaseClient,
  orgId: string,
  ids: string[],
  publico: "prospects" | "contatos",
  categorias: string[],
): Promise<ProspectParaEnvio | null> {
  return publico === "contatos"
    ? escolherContato(admin, orgId, ids)
    : escolherProspect(admin, orgId, ids, categorias);
}

/** O primeiro CONTATO da lista (na ORDEM do array) que ainda pode receber. */
async function escolherContato(
  admin: SupabaseClient,
  orgId: string,
  ids: string[],
): Promise<ProspectParaEnvio | null> {
  if (ids.length === 0) return null;
  const { data } = await admin
    .from("contacts")
    .select("id, name, display_name, phone_number")
    .eq("organization_id", orgId)
    .in("id", ids);
  const porId = new Map(
    ((data ?? []) as unknown as Array<{
      id: string;
      name: string | null;
      display_name: string | null;
      phone_number: string | null;
    }>).map((c) => [c.id, c]),
  );

  for (const id of ids) {
    const c = porId.get(id);
    if (!c) continue; // contato apagado — o tick ignora e segue
    const fone = c.phone_number ? normalizaTelefone(c.phone_number) : null;
    if (!fone || !/^\+\d{8,15}$/.test(fone)) continue;
    return {
      id,
      nome: c.display_name ?? c.name ?? "(sem nome)",
      telefone_normalizado: fone,
      // Recuperação é contato, não empresa: não há cidade/categoria na ficha.
      // O token correspondente vira vazio e o envio recusa antes de sair.
      cidade: null,
      categoria: null,
    };
  }
  return null;
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
  categorias: string[],
): Promise<ProspectParaEnvio | null> {
  if (ids.length === 0) return null;
  const { data } = await admin
    .from("business_prospects")
    .select(
      "id, nome, telefone_normalizado, do_not_contact, bloqueado, status_comercial, categoria, categorias, website, categoria_canonica, categoria_revisar, cidade",
    )
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
    // A MESMA categoriaEfetiva da tela e do disparo: cafeteria dentro do posto
    // não recebe campanha de posto, e linha em REVISÃO não recebe campanha
    // nenhuma — nem a campanha histórica sem recorte de categoria. O recorte
    // vazio continua sendo "toda a cidade" para as linhas classificadas.
    const efetiva = categoriaEfetiva(p);
    if (efetiva.revisar) continue;
    if (categorias.length > 0 && !categoriaCombinaComCampanha(efetiva, categorias)) continue;
    const fone = p.telefone_normalizado;
    if (!fone || !/^\+\d{8,15}$/.test(fone)) continue;
    return {
      id,
      nome: p.nome ?? "(sem nome)",
      telefone_normalizado: fone,
      cidade: (p as unknown as { cidade?: string | null }).cidade ?? null,
      categoria: efetiva.rotulo,
      // 0285 — qual categoria do recorte casou. O motor usa esta chave para
      // escolher o modelo, e a ordem é a da campanha (determinística).
      categoria_campanha: categoriaDaCampanhaQueCombina(efetiva, categorias),
    };
  }
  return null;
}

/**
 * `janelas` é jsonb; um shape torto vira lista vazia (= sempre dentro).
 *
 * `dias` ausente/vazia é preservado como ausente: os dois significam "todos os
 * dias" no motor, e gravar `[]` na leitura faria a linha parecer editada.
 */
function normalizarJanelas(bruto: unknown): JanelaDoDia[] {
  if (!Array.isArray(bruto)) return [];
  const saida: JanelaDoDia[] = [];
  for (const j of bruto) {
    if (!j || typeof j !== "object") continue;
    const inicio = (j as { inicio?: unknown }).inicio;
    const fim = (j as { fim?: unknown }).fim;
    if (typeof inicio !== "string" || typeof fim !== "string") continue;
    const janela: JanelaDoDia = { inicio, fim };
    const dias = (j as { dias?: unknown }).dias;
    if (Array.isArray(dias)) {
      const limpos = dias.filter(
        (d): d is number => typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 6,
      );
      if (limpos.length > 0) janela.dias = limpos;
    }
    saida.push(janela);
  }
  return saida;
}
