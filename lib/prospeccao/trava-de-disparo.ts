/**
 * A TRAVA DE DISPARO — um "Enviar agora" por NÚMERO, de cada vez.
 *
 * ═══ O defeito que isto fecha ═══════════════════════════════════════════════
 *
 * O ritmo do disparo em lote mora num `Map` em memória (`_ultimoEnvio`, na rota
 * `prospects/disparar`). Ele funciona para UM envio por vez e não funciona para
 * dois cliques simultâneos: as duas requisições leem o "último envio" antes de
 * qualquer uma escrever, então as duas acham que podem mandar agora. Medido em
 * 26/10/2026 na instalação do usuário: três requisições (20+19+10 prospects)
 * passaram juntas e o número mandou ~3 mensagens por minuto com a tela
 * prometendo 2 min de intervalo. Quem paga é a linha da empresa.
 *
 * Memória não resolve isso — o `Map` é POR PROCESSO, e o produto roda em mais de
 * um. Por isso a trava é uma LINHA do banco (`channel_sessions`), adquirida com
 * um UPDATE condicional: duas requisições não conseguem as duas casar a mesma
 * linha, porque no `READ COMMITTED` a segunda reavalia o `where` depois do
 * commit da primeira.
 *
 * ═══ Por que LEASE, e por que por NÚMERO ════════════════════════════════════
 *
 * LEASE (`dispatch_locked_until`) e não booleano: a requisição que morre no meio
 * — restart, deploy, aba fechada — não pode deixar o número travado para sempre.
 * O TTL acompanha o PLANO (intervalo × quantidade + folga); quando vence, quem
 * chega assume, e a pior consequência é um envio lento que já estava no fim.
 *
 * Por NÚMERO e não por campanha: o ritmo e a cota que importam são os do
 * aparelho. Duas campanhas diferentes no mesmo número brigam pelo mesmo ritmo, e
 * uma trava por campanha deixaria as duas mandarem juntas.
 *
 * `dispatch_lock_token` faz a liberação ser do DONO. Sem ele, a requisição que
 * perdeu a trava por TTL destravaria o disparo de quem assumiu — e voltaríamos
 * à estaca zero com duas falas no mesmo número.
 */
import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Teto do lease. Um plano de 500 empresas a 10 min levaria 83h; a trava não
 * pode ficar 83h presa se o processo morrer no primeiro minuto. Como o ledger
 * (`prospecting_sends`, unique por organização) já impede mensagem duplicada
 * para a MESMA empresa, o pior caso de um lease curto é um disparo novo começar
 * enquanto o antigo termina — e o ritmo por número continua valendo para os dois
 * (o `Map` de memória e o `pacing_ledger`).
 */
export const TETO_DA_TRAVA_MS = 6 * 60 * 60 * 1000;

/**
 * Quanto tempo o número fica reservado para este plano.
 *
 * `espacoMs × aprovados` é a duração prometida na tela; a folga cobre o envio em
 * si (montar contato, conversa, POST no canal) e o jitter. Há um piso por
 * mensagem de 5s porque o intervalo pode ser 0 no "Enviar agora" (a saída de
 * emergência) e cada envio ainda custa uma ida ao canal: sem o piso, um lote de
 * 500 com intervalo 0 ganharia um lease de 2min e o segundo clique entraria no
 * meio do primeiro. O mínimo do lease como um todo é o próprio intervalo ou
 * 2 min — um lease menor que o intervalo deixaria a segunda requisição entrar
 * entre duas mensagens do mesmo plano.
 */
export function validadeDaTrava(espacoMs: number, aprovados: number): number {
  const intervalo = Math.max(1_000, Number.isFinite(espacoMs) ? espacoMs : 0);
  const quantidade = Math.max(0, Math.floor(aprovados));
  const porMensagem = Math.max(intervalo, 5_000);
  const duracao = porMensagem * quantidade;
  const folga = Math.max(120_000, intervalo);
  return Math.min(TETO_DA_TRAVA_MS, duracao + folga);
}

export interface TravaDeDisparo {
  /** O dono do lease. Só ele consegue liberar. */
  token: string;
  /** Quando o lease vence sozinho (ISO). */
  expiraEm: string;
}

export type ResultadoDaTrava =
  | { ok: true; trava: TravaDeDisparo }
  | {
      ok: false;
      /** Até quando o dono atual segura o número (ISO), se deu para ler. */
      ocupadaAte: string | null;
    };

/**
 * Tenta reservar o número para um disparo em lote.
 *
 * A aquisição é UM update condicional — nada de "leio, decido, gravo". Filtrar
 * por `dispatch_locked_until is null or < agora` é o que faz a corrida terminar
 * em uma vencedora só: o Postgres reavalia a condição contra a linha já
 * atualizada.
 *
 * Não lança: erro de banco devolve "ocupada" sem horário. Na dúvida, não manda
 * — um disparo recusado se repete em um clique; uma rajada não se desfaz.
 */
export async function travarDisparo(
  admin: SupabaseClient,
  p: {
    orgId: string;
    sessaoId: string;
    /** Quanto tempo o número fica reservado, em ms (`validadeDaTrava`). */
    validadeMs: number;
    agora?: Date;
  },
): Promise<ResultadoDaTrava> {
  const agora = p.agora ?? new Date();
  const agoraIso = agora.toISOString();
  const expiraEm = new Date(agora.getTime() + Math.max(1_000, p.validadeMs)).toISOString();
  const token = randomUUID();
  const valores = { dispatch_locked_until: expiraEm, dispatch_lock_token: token };

  /**
   * Um update condicional. Dois, em sequência, em vez de um `or` no filtro:
   *   1. livre (`is null`)           — o caso normal
   *   2. lease vencido (`lt agora`)  — quem morreu no meio
   * Cada um é uma instrução atômica; a corrida termina em uma vencedora só
   * porque o Postgres reavalia o `where` contra a linha já atualizada.
   */
  const livre = await admin
    .from("channel_sessions")
    .update(valores)
    .eq("id", p.sessaoId)
    .eq("organization_id", p.orgId)
    .is("dispatch_locked_until", null)
    .select("id");
  if (livre.error) return { ok: false, ocupadaAte: null };
  if ((livre.data ?? []).length > 0) return { ok: true, trava: { token, expiraEm } };

  const vencida = await admin
    .from("channel_sessions")
    .update(valores)
    .eq("id", p.sessaoId)
    .eq("organization_id", p.orgId)
    .lt("dispatch_locked_until", agoraIso)
    .select("id");
  if (vencida.error) return { ok: false, ocupadaAte: null };
  if ((vencida.data ?? []).length > 0) return { ok: true, trava: { token, expiraEm } };

  // Perdeu a corrida: ler até quando o dono segura, para a tela dizer a verdade
  // ("o número está enviando até 14:32") em vez de "tente de novo".
  const { data: atual } = await admin
    .from("channel_sessions")
    .select("dispatch_locked_until")
    .eq("id", p.sessaoId)
    .eq("organization_id", p.orgId)
    .maybeSingle();
  return {
    ok: false,
    ocupadaAte: (atual as { dispatch_locked_until?: string | null } | null)?.dispatch_locked_until ?? null,
  };
}

/**
 * Solta a trava — só se ainda for do dono.
 *
 * Falhar aqui não derruba o disparo (as mensagens já saíram); o lease vence
 * sozinho no pior caso. Mas o filtro pelo token é o que impede esta requisição
 * de destravar o disparo de OUTRA, que assumiu depois do vencimento.
 */
export async function soltarDisparo(
  admin: SupabaseClient,
  p: { orgId: string; sessaoId: string; token: string },
): Promise<void> {
  const { error } = await admin
    .from("channel_sessions")
    .update({ dispatch_locked_until: null, dispatch_lock_token: null })
    .eq("id", p.sessaoId)
    .eq("organization_id", p.orgId)
    .eq("dispatch_lock_token", p.token);
  if (error) {
    // Sem log aqui de propósito: quem chama é um `finally`, e o caminho já tem
    // o resultado do disparo para reportar. O lease vence sozinho.
    return;
  }
}
