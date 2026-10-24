/**
 * O RESUMO DE ENVIO DE UMA CAMPANHA — a conta que a tela de controle mostra.
 *
 * ═══ POR QUE ESTA FUNÇÃO EXISTE ═══════════════════════════════════════════
 *
 * O funil da campanha (spec 19, §28) responde "quantas empresas foram
 * encontradas/contatadas", mas não responde a pergunta operacional do dono:
 * "quantas mensagens já saíram e quantas ainda faltam?". A lista de campanhas
 * mostrava o funil e escondia a fila; depois de criar, o operador não tinha
 * onde ver o que estava pendente.
 *
 * O ledger `prospecting_sends` é a fonte da verdade do envio:
 *
 *   - linha com `message_id`  → a mensagem saiu (o comprovante foi gravado);
 *   - linha sem `message_id`  → a reserva existe, mas o envio não confirmou
 *     (pode ter falhado ou sido interrompido);
 *   - sem linha               → o prospect está na lista fechada e ainda não
 *     foi reservado/enviado.
 *
 * `pendentes` é `total - enviados` de propósito: inclui tanto as reservas sem
 * comprovante quanto quem ainda nem entrou no ledger. A tela separa os dois
 * ("sem confirmação") porque a ação é diferente — o primeiro grupo precisa ser
 * conferido antes de reenviar, o segundo só precisa ser disparado.
 *
 * A função é pura para poder ser testada sem banco e para a lista e o painel
 * usarem a MESMA régua. Duas contagens diferentes na mesma tela foi o defeito
 * que fez o operador duvidar do número.
 */

export interface EnvioDaCampanha {
  /** A campanha da linha — a lista usa para agrupar em lote. */
  campaign_id?: string;
  prospect_id: string;
  /** `null` = reserva sem comprovante (envio não confirmado). */
  message_id: string | null;
  /** Instante da reserva; a tela de controle troca pelo `sent_at` real. */
  enviado_em: string | null;
  /**
   * `messages.status` do envio confirmado — o que o CANAL respondeu depois.
   * Ausente/nulo = ninguém consultou (a lista de campanhas não precisa disso).
   */
  status?: string | null;
  /** Confirmações do canal, quando a consulta trouxe `messages`. */
  delivered_at?: string | null;
  read_at?: string | null;
}

/** O degrau de entrega que a tela mostra por empresa. */
export type EntregaConfirmada = "enviada" | "entregue" | "lida" | "falhou" | null;

/**
 * `messages.status` → degrau de entrega. `queued`/`sending` contam como
 * "enviada" porque a linha do ledger JÁ tem `message_id`: o POST foi aceito.
 */
export function entregaDoStatus(status: string | null | undefined): EntregaConfirmada {
  switch (status) {
    case "delivered":
      return "entregue";
    case "read":
      return "lida";
    case "failed":
      return "falhou";
    case "sent":
    case "queued":
    case "sending":
      return "enviada";
    default:
      return null;
  }
}

export interface ResumoDeEnvio {
  /** O tamanho da fila: lista fechada, ledger ou o público calculado. */
  total: number;
  /** Linhas com `message_id` — o envio foi confirmado. */
  enviados: number;
  /** `total - enviados`, nunca negativo. */
  pendentes: number;
  /** Linhas do ledger sem `message_id` (reserva sem comprovante). */
  sem_confirmacao: number;
  /** 0..100, arredondado para a barra de progresso. */
  percentual: number;
  /** O envio confirmado mais recente. */
  ultimo_envio_at: string | null;
  /**
   * O que o canal confirmou DEPOIS do envio. `lidos ⊆ entregues ⊆ enviados`:
   * ler implica ter chegado, e a tela usa isso para não mostrar número que
   * contradiz o de cima.
   */
  entregues: number;
  lidos: number;
  /** Envios que o canal recusou na ENTREGA (ex.: 131047 no oficial). */
  falhas: number;
}

function instante(iso: string | null | undefined): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

export function resumirEnvios(input: {
  /** A lista fechada da campanha (`prospect_ids`), quando existe. */
  prospectIds?: readonly string[] | null;
  /** As linhas do ledger desta campanha. */
  sends: readonly EnvioDaCampanha[];
  /** Fallback para o público calculado (campanha ainda sem lista fechada). */
  totalFallback?: number;
}): ResumoDeEnvio {
  // Uma linha por prospect é a regra do banco, mas a tela não deve inflar a
  // contagem se um dia a regra mudar: o mapa garante a unicidade.
  const porProspect = new Map<string, EnvioDaCampanha>();
  for (const s of input.sends) porProspect.set(s.prospect_id, s);

  const lista = input.prospectIds?.filter((id) => typeof id === "string" && id.trim() !== "") ?? [];
  const total = Math.max(lista.length, porProspect.size, Math.max(0, input.totalFallback ?? 0));

  let enviados = 0;
  let semConfirmacao = 0;
  let entregues = 0;
  let lidos = 0;
  let falhas = 0;
  let ultimo = 0;
  for (const s of porProspect.values()) {
    if (s.message_id) {
      enviados += 1;
      ultimo = Math.max(ultimo, instante(s.enviado_em));
      // `lido` implica entregue: a Meta manda os dois eventos, e contar o
      // `read` só em "lidos" faria a tela mostrar 10 lidas e 3 entregues.
      if (s.status === "read") {
        lidos += 1;
        entregues += 1;
      } else if (s.status === "delivered") {
        entregues += 1;
      } else if (s.status === "failed") {
        falhas += 1;
      }
    } else {
      semConfirmacao += 1;
    }
  }

  const pendentes = Math.max(total - enviados, 0);
  const percentual = total > 0 ? Math.min(100, Math.round((enviados / total) * 100)) : 0;

  return {
    total,
    enviados,
    pendentes,
    sem_confirmacao: semConfirmacao,
    percentual,
    ultimo_envio_at: ultimo > 0 ? new Date(ultimo).toISOString() : null,
    entregues,
    lidos,
    falhas,
  };
}
