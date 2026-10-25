/**
 * A QUALIDADE DO NÚMERO — ler, guardar e agir.
 *
 * ═══ O DEFEITO QUE ESTE MÓDULO FECHA ════════════════════════════════════════
 *
 * O canal oficial já pedia `quality_rating` à Graph API em `checkHealth` e
 * descartava a resposta. Uma queda para RED — o estado em que a Meta pausa
 * templates (3h, depois 6h, depois desabilita) e, se repetir, penaliza o
 * número — era invisível: a coluna seguia dizendo `WORKING`, a campanha seguia
 * disparando, e a descoberta acontecia quando o número parava de entregar.
 *
 * Não era falta de dado: era dado lido e jogado fora.
 *
 * ═══ POR QUE PAUSAR, E NÃO SÓ AVISAR ════════════════════════════════════════
 *
 * Em RED a Meta ainda ACEITA o envio (a documentação diz que o template "can
 * be sent, but is in danger"). Deixar a decisão para o operador significa que,
 * entre a leitura e o clique, a campanha continua empurrando mensagens para
 * contatos que já reclamaram — que é exatamente o sinal que rebaixou o número.
 * A pausa é reversível e visível (`pausa_motivo` no controle); seguir não é.
 *
 * ═══ DOIS NÍVEIS, COMO O RESTO DO REPO ══════════════════════════════════════
 *
 * As funções puras (`normalizarQualidade`, `limiteCaiu`) decidem SOZINHAS e
 * são testadas sem banco. `sincronizarQualidadeDoNumero` é o efeito: grava,
 * pausa e avisa — e só quando o estado MUDA, para um vigia de cinco em cinco
 * minutos não abrir um aviso por rodada.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

/** O vocabulário da plataforma, em maiúsculas. `null` = não sei/não informado. */
export type QualidadeDoNumero = "GREEN" | "YELLOW" | "RED" | "UNKNOWN";

const QUALIDADES: readonly QualidadeDoNumero[] = ["GREEN", "YELLOW", "RED", "UNKNOWN"];

/**
 * Normaliza o que veio da plataforma. Valor desconhecido vira `null` (não
 * `UNKNOWN`): "não sei" e "a plataforma disse que ainda não há nota" são coisas
 * diferentes, e gravar `UNKNOWN` para um texto inesperado inventaria a segunda.
 */
export function normalizarQualidade(v: unknown): QualidadeDoNumero | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toUpperCase();
  return (QUALIDADES as readonly string[]).includes(s) ? (s as QualidadeDoNumero) : null;
}

/**
 * Ordem dos degraus de limite do portfólio. `TIER_NOT_SET` é o piso (número
 * recém-criado); `TIER_UNLIMITED` é o topo.
 *
 * Fonte: `phone_number_quality_update` (Meta). O degrau é do PORTFÓLIO e
 * compartilhado entre números — guardar por sessão é o que permite mostrar
 * qual número está na ponta do fio, não que cada um tenha cota própria.
 */
const DEGRAUS: readonly string[] = [
  "TIER_NOT_SET",
  "TIER_50",
  "TIER_250",
  "TIER_2K",
  "TIER_10K",
  "TIER_100K",
  "TIER_UNLIMITED",
];

export function degrauDoLimite(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const i = DEGRAUS.indexOf(v.trim().toUpperCase());
  return i < 0 ? null : i;
}

/**
 * O limite CAIU? Só uma queda dispara pausa: uma subida (`THROUGHPUT_UPGRADE`)
 * é boa notícia, e um valor que não sabemos comparar não autoriza mexer em
 * campanha nenhuma — fail-closed é para o gate de envio, não para pausar por
 * suposição.
 */
export function limiteCaiu(anterior: unknown, novo: unknown): boolean {
  const a = degrauDoLimite(anterior);
  const n = degrauDoLimite(novo);
  return a !== null && n !== null && n < a;
}

/** Por que a campanha foi pausada — texto que o operador lê no controle. */
export function motivoDaPausaPorQualidade(
  qualidade: QualidadeDoNumero,
  apelido: string,
): string {
  return (
    `O número "${apelido}" está com qualidade ${qualidade} na Meta. ` +
    "Campanhas por modelo foram pausadas para não piorar a avaliação do número. " +
    "Revise o conteúdo e o público dos últimos envios; quando a qualidade voltar para GREEN, retome a campanha."
  );
}

export function motivoDaPausaPorLimite(
  anterior: string | null,
  novo: string,
  apelido: string,
): string {
  return (
    `A Meta reduziu o limite de mensagens do portfólio de ${anterior ?? "—"} para ${novo} ` +
    `(número "${apelido}"). O limite é compartilhado entre todos os números da empresa. ` +
    "As campanhas por modelo foram pausadas para não estourar a cota nem piorar a qualidade; " +
    "revise o público e retome quando fizer sentido."
  );
}

export interface ResultadoDaQualidade {
  /** O que foi gravado (ou `null` quando a plataforma não informou). */
  qualidade: QualidadeDoNumero | null;
  /** Mudou em relação ao que estava no banco? */
  mudou: boolean;
  /** Quantas campanhas foram pausadas nesta chamada. */
  campanhasPausadas: number;
  /** Abriu aviso na Central? */
  avisou: boolean;
  /** Fechou aviso de qualidade anterior? */
  resolveuAviso: boolean;
}

/**
 * Pausa as campanhas por MODELO da organização.
 *
 * Só `mensagem_tipo = 'template'`: uma campanha de texto livre roda por um
 * número de QR, e a qualidade do oficial não diz nada sobre ela. Pausar as duas
 * misturaria dois canais com físicas diferentes — a mesma razão pela qual o
 * motor escolhe a sessão por capability.
 */
export async function pausarCampanhasPorModelo(
  admin: SupabaseClient,
  organizationId: string,
  motivo: string,
  agoraIso: string,
): Promise<number> {
  const { data, error } = await admin
    .from("prospecting_campaigns")
    .update({ status: "pausada", pausa_motivo: motivo, pausa_em: agoraIso })
    .eq("organization_id", organizationId)
    .eq("status", "ativa")
    .eq("mensagem_tipo", "template")
    .select("id");
  if (error) {
    logger.error("[qualidade] não consegui pausar as campanhas por modelo", {
      organizationId,
      causa: error.message,
    });
    return 0;
  }
  return (data ?? []).length;
}

const TITULO_DO_AVISO = "Qualidade do número";

/**
 * Grava o que a plataforma disse e age quando o estado PIORA.
 *
 * `qualidadeAnterior` vem de quem já leu a linha (o cron lê a sessão de
 * qualquer forma) — evita um SELECT extra e deixa a decisão de "mudou ou não"
 * testável. Quando não é passada, o módulo lê do banco.
 */
export async function sincronizarQualidadeDoNumero(
  admin: SupabaseClient,
  p: {
    organizationId: string;
    sessaoId: string;
    apelido: string;
    qualidade?: QualidadeDoNumero | null;
    limite?: string | null;
    agoraIso: string;
  },
): Promise<ResultadoDaQualidade> {
  const { data: atual } = await admin
    .from("channel_sessions")
    .select("quality_rating, messaging_limit")
    .eq("id", p.sessaoId)
    .eq("organization_id", p.organizationId)
    .maybeSingle();

  const anterior = normalizarQualidade(
    (atual as { quality_rating?: string | null } | null)?.quality_rating,
  );
  const qualidade = p.qualidade ?? anterior;
  const limiteAnterior =
    (atual as { messaging_limit?: string | null } | null)?.messaging_limit ?? null;

  const patch: Record<string, unknown> = {};
  // `null` é "a plataforma não informou", não "não tem nota": sobrescrever um
  // RED conhecido com null apagaria a única evidência da queda e faria o
  // próximo ciclo achar que houve melhora.
  if (p.qualidade !== undefined && p.qualidade !== null) {
    patch.quality_rating = p.qualidade;
    patch.quality_updated_at = p.agoraIso;
  }
  if (p.limite !== undefined && p.limite !== null) {
    patch.messaging_limit = p.limite;
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await admin
      .from("channel_sessions")
      .update(patch)
      .eq("id", p.sessaoId)
      .eq("organization_id", p.organizationId);
    if (error) {
      logger.warn("[qualidade] não consegui gravar a qualidade do número", {
        sessaoId: p.sessaoId,
        causa: error.message,
      });
    }
  }

  let campanhasPausadas = 0;
  let avisou = false;
  let resolveuAviso = false;

  const virouRuim = qualidade === "RED" && anterior !== "RED";
  const limitePiorou =
    p.limite !== undefined && limiteCaiu(limiteAnterior, p.limite);

  if (virouRuim || limitePiorou) {
    const motivo = virouRuim
      ? motivoDaPausaPorQualidade("RED", p.apelido)
      : motivoDaPausaPorLimite(limiteAnterior, p.limite ?? "—", p.apelido);

    campanhasPausadas = await pausarCampanhasPorModelo(
      admin,
      p.organizationId,
      motivo,
      p.agoraIso,
    );

    const { error } = await admin.from("agent_inbox_items").insert({
      organization_id: p.organizationId,
      kind: "channel_number_alert",
      severity: "critical",
      title: `${TITULO_DO_AVISO} "${p.apelido}"`,
      body: motivo,
      ref_kind: "channel_session",
      ref_id: p.sessaoId,
    });
    if (error) {
      logger.warn("[qualidade] não consegui abrir o aviso na Central", {
        sessaoId: p.sessaoId,
        causa: error.message,
      });
    } else {
      avisou = true;
    }

    logger.warn("[qualidade] número sinalizado — campanhas pausadas", {
      organizationId: p.organizationId,
      sessaoId: p.sessaoId,
      qualidade,
      limiteAnterior,
      limite: p.limite ?? null,
      campanhasPausadas,
    });
  }

  // A volta para GREEN fecha o aviso — mas NÃO retoma campanha: quem retoma é
  // uma pessoa, olhando o que causou a queda. Retomar sozinho transformaria o
  // alívio em segundo disparo para o mesmo público que reclamou.
  if (anterior === "RED" && qualidade !== null && qualidade !== "RED") {
    const { error } = await admin
      .from("agent_inbox_items")
      .update({ status: "resolved" })
      .eq("organization_id", p.organizationId)
      .eq("kind", "channel_number_alert")
      .eq("ref_kind", "channel_session")
      .eq("ref_id", p.sessaoId)
      .eq("status", "open")
      .like("title", `${TITULO_DO_AVISO}%`);
    resolveuAviso = !error;
  }

  return {
    qualidade,
    mudou: anterior !== qualidade,
    campanhasPausadas,
    avisou,
    resolveuAviso,
  };
}
