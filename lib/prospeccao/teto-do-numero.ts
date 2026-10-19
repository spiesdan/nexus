/**
 * O TETO DIÁRIO DO NÚMERO — quantas mensagens o WhatsApp da empresa aguenta
 * hoje, e quantas ele já gastou.
 *
 * ═══ Por que isto não é a cota da campanha ═════════════════════════════════
 *
 * A campanha tem a cota DELA (`limite_diario`, o "50 por dia" que o operador
 * escolhe na tela). O número tem um teto que **não é do operador**: o limite do
 * CRM (`channel_sessions.daily_message_limit`) e o degrau de WARM-UP da idade do
 * número — número recém-pareado começa em 20/dia, número formado não tem teto.
 *
 * Quem obedece esse teto é o motor anti-ban (`lib/agent-engine/pacing`), e é ele
 * que impede o número de ser banido. Se o disparo em lote o ignorasse, o produto
 * estaria mandando 50 mensagens por um número no dia em que ele mesmo diz que
 * 20 é o seguro — e quem leva o banimento é a linha da empresa, não a campanha.
 *
 * As DUAS portas do disparo passam por aqui — o agendamento (`agendado.ts`) e o
 * "Enviar agora" (`prospects/disparar`). Duas réguas para a mesma pergunta
 * divergem; uma função só, não.
 *
 * ═══ O dia é o LOCAL da organização ════════════════════════════════════════
 *
 * A contagem começa na meia-noite local (`inicioDoDiaNoFuso`), a MESMA régua de
 * `loadPacingState` — o `sentToday` que o agente de IA vê. Contar em UTC faria o
 * dia virar às 21h de Brasília e a cota "reiniciar" antes da meia-noite de quem
 * opera.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { warmupCapFor } from "@/lib/agent-engine/pacing/engine";
import { effectiveKnobs, idadeEmDias, type ChannelKnobsRow } from "@/lib/ai/pacing-knobs";

import { inicioDoDiaNoFuso } from "./agendamento";

export interface TetoDoNumero {
  /**
   * Quantas mensagens este número pode mandar HOJE. `Infinity` = número formado
   * E sem limite de CRM — aí quem manda é só a cota da campanha.
   */
  teto: number;
  /** Envios de hoje pelo número, de QUALQUER origem (campanhas + agente de IA). */
  enviadosHoje: number;
}

/**
 * Lê o teto e o gasto do dia. Não lança: uma leitura que falha cai nos DEFAULTS
 * do pacing (idade 0, 20/dia) — conservador, nunca zero, para o disparo não
 * travar de vez por causa de uma query.
 */
export async function lerTetoDoNumero(
  admin: SupabaseClient,
  p: {
    orgId: string;
    sessaoId: string;
    agoraIso: string;
    fuso: string | null;
    /** `channel_sessions.daily_message_limit`, se o chamador já o leu. */
    limiteDoCrm?: number | null;
  },
): Promise<TetoDoNumero> {
  // `channel_knobs` é por NÚMERO: linha ausente (quem nunca abriu Conexões) cai
  // nos defaults do pacing. É a mesma leitura que `knobsDoCanal` faz para a
  // automação e `loadChannelKnobs` para o agente, com as MESMAS funções puras.
  const { data: knobsRow } = await admin
    .from("channel_knobs")
    .select(
      "throttle_ms, jitter_max_ms, window_start_hour, window_end_hour, allow_sunday, " +
        "timezone, warmup_daily_caps, number_activated_at",
    )
    .eq("organization_id", p.orgId)
    .eq("channel_session_id", p.sessaoId)
    .maybeSingle();
  const linha = knobsRow as unknown as ChannelKnobsRow | null;
  const knobs = effectiveKnobs(linha);
  const capWarmup = warmupCapFor(idadeEmDias(linha, new Date(p.agoraIso)), knobs.warmupDailyCaps);
  const capDoCrm = typeof p.limiteDoCrm === "number" ? p.limiteDoCrm : null;
  const teto = Math.min(
    capWarmup ?? Number.POSITIVE_INFINITY,
    capDoCrm ?? Number.POSITIVE_INFINITY,
  );

  const { count } = await admin
    .from("pacing_ledger")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", p.orgId)
    .eq("channel_session_id", p.sessaoId)
    .gte("sent_at", inicioDoDiaNoFuso(p.agoraIso, p.fuso));

  return { teto, enviadosHoje: count ?? 0 };
}
