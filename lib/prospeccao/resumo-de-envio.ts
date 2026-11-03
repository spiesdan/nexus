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
 * O ledger `prospecting_sends` é a fonte da verdade do TRABALHO:
 *
 *   - sem linha               → o prospect está na lista fechada e ainda não
 *     foi reservado (`pendentes`);
 *   - linha sem `message_id`  → a reserva existe, mas o envio não chegou a ser
 *     aceito pelo transporte (`sem_comprovante`);
 *   - linha com `message_id`  → o TRANSPORTE aceitou o pedido (`aceitas`).
 *     Isso NÃO é entrega: no WhatsApp por QR o POST volta com id mesmo quando
 *     a plataforma recusa depois (erro 463). O desfecho real chega no ack.
 *
 * `enviados`/`confirmadas` é o número que o dono lê como "saiu": só conta o
 * que o WhatsApp confirmou (ack ≥ 1, `delivered` ou `read`). Medido em
 * 30/10/2026: a campanha mostrava 90 "enviadas" com 22 confirmações — 68
 * mensagens que nunca existiram no celular do cliente. O bug não era de
 * contagem, era de SIGNIFICADO: `sent` estava sendo gravado no aceite do
 * transporte. A tela agora separa os quatro degraus porque a ação é diferente
 * em cada um — conferir, reenviar, aguardar ou nada.
 *
 * A função é pura para poder ser testada sem banco e para a lista e o painel
 * usarem a MESMA régua. Duas contagens diferentes na mesma tela foi o defeito
 * que fez o operador duvidar do número.
 */

export interface EnvioDaCampanha {
  /** A campanha da linha — a lista usa para agrupar em lote. */
  campaign_id?: string;
  prospect_id: string;
  /** `null` = reserva sem comprovante (o transporte não devolveu id). */
  message_id: string | null;
  /** Instante da reserva; a tela de controle troca pelo `sent_at` real. */
  enviado_em: string | null;
  /**
   * `messages.status` da linha de mensagem — o que o CANAL respondeu depois.
   * Ausente/nulo = ninguém consultou (a lista de campanhas não precisa disso).
   */
  status?: string | null;
  /**
   * `messages.ack` do WhatsApp: 0 = pendente; 1 = recebida pelo servidor da
   * plataforma; 2 = entregue no aparelho; 3+ = lida; < 0 = erro. É o único
   * sinal de que a mensagem realmente saiu — `status: "sent"` sozinho é o
   * aceite do transporte.
   */
  ack?: number | null;
  /** Confirmações do canal, quando a consulta trouxe `messages`. */
  delivered_at?: string | null;
  read_at?: string | null;
}

/** O degrau de entrega que a tela mostra por empresa. */
export type EntregaConfirmada = "enviada" | "entregue" | "lida" | "falhou" | "pendente" | null;

/**
 * `messages.status` + `ack` → degrau de entrega.
 *
 * `pendente` é o estado em que o transporte aceitou (ou reservou) e o WhatsApp
 * ainda não falou nada. Não é sucesso e não é falha — é a maior parte das 90
 * linhas medidas em 30/10. Antes este estado virava "enviada" só porque havia
 * `message_id`, e era isso que deixava o inbox verde para uma mensagem que o
 * celular do cliente nunca recebeu.
 *
 * O ack manda mais que o status porque é ele que vem da plataforma: uma linha
 * legada pode estar `sent` com `ack = -1` (o 463), e ela é falha, não envio.
 */
export function entregaDoStatus(
  status: string | null | undefined,
  ack?: number | null,
): EntregaConfirmada {
  const degrau = typeof ack === "number" ? ack : null;
  if (status === "failed" || (degrau !== null && degrau < 0)) return "falhou";
  if (status === "read" || (degrau !== null && degrau >= 3)) return "lida";
  if (status === "delivered" || (degrau !== null && degrau >= 2)) return "entregue";
  // ack 1 = o servidor do WhatsApp recebeu a mensagem para aquele contato.
  // É o primeiro degrau que prova que ela saiu do nosso lado.
  if (degrau !== null && degrau >= 1) return "enviada";
  if (status === "sent" || status === "sending" || status === "queued") return "pendente";
  return null;
}

/** O WhatsApp confirmou o recebimento — em qualquer degrau acima de "saiu". */
export function confirmada(degrau: EntregaConfirmada): boolean {
  return degrau === "enviada" || degrau === "entregue" || degrau === "lida";
}

export interface ResumoDeEnvio {
  /** O tamanho da fila: lista fechada, ledger ou o público calculado. */
  total: number;
  /** Linhas com `message_id` — o TRANSPORTE aceitou o pedido. Não é entrega. */
  aceitas: number;
  /**
   * Confirmadas pelo WhatsApp (ack ≥ 1, entregue ou lida). É o número que a
   * tela mostra como "confirmadas" — o único que o dono pode conferir no
   * celular.
   */
  enviados: number;
  /** `total - aceitas`: ainda não reservadas, podem ser disparadas. */
  pendentes: number;
  /** Linhas do ledger sem `message_id` (reserva sem comprovante). */
  sem_comprovante: number;
  /** Aceitas que o WhatsApp não confirmou nem recusou (ainda sem ack). */
  sem_confirmacao: number;
  /** 0..100, arredondado para a barra de progresso — sobre CONFIRMADAS. */
  percentual: number;
  /** A última aceitação do transporte. */
  ultimo_envio_at: string | null;
  /**
   * O que o canal confirmou DEPOIS do envio. `lidos ⊆ entregues ⊆ enviados`:
   * ler implica ter chegado, e a tela usa isso para não mostrar número que
   * contradiz o de cima.
   */
  entregues: number;
  lidos: number;
  /** O WhatsApp recusou (`failed` ou ack < 0) — não é "sem confirmação". */
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

  let aceitas = 0;
  let confirmadas = 0;
  let semComprovante = 0;
  let semConfirmacao = 0;
  let entregues = 0;
  let lidos = 0;
  let falhas = 0;
  let ultimo = 0;
  for (const s of porProspect.values()) {
    const degrau = entregaDoStatus(s.status, s.ack);
    if (!s.message_id) semComprovante += 1;
    else aceitas += 1;

    // Falha é desfecho conhecido: conta em `falhas`, não em "sem confirmação".
    // Misturar os dois esconderia a diferença entre "não sabemos" e "o
    // WhatsApp recusou" — que é justamente a informação que o operador precisa.
    if (degrau === "falhou") {
      falhas += 1;
      continue;
    }
    if (confirmada(degrau)) {
      confirmadas += 1;
      // "Último envio" é o último que o WhatsApp confirmou. Carimbar com o
      // aceite do transporte era a mesma mentira do contador.
      ultimo = Math.max(ultimo, instante(s.enviado_em));
      // `lido` implica entregue: a Meta manda os dois eventos, e contar o
      // `read` só em "lidos" faria a tela mostrar 10 lidas e 3 entregues.
      if (degrau === "lida") {
        lidos += 1;
        entregues += 1;
      } else if (degrau === "entregue") {
        entregues += 1;
      }
    } else {
      // Aceita sem ack OU reserva sem comprovante: nos dois casos o WhatsApp
      // não confirmou (a reserva aparece também em `sem_comprovante`).
      semConfirmacao += 1;
    }
  }

  const pendentes = Math.max(total - aceitas - semComprovante, 0);
  const percentual =
    total > 0 ? Math.min(100, Math.round((confirmadas / total) * 100)) : 0;

  return {
    total,
    aceitas,
    enviados: confirmadas,
    pendentes,
    sem_comprovante: semComprovante,
    sem_confirmacao: semConfirmacao,
    percentual,
    ultimo_envio_at: ultimo > 0 ? new Date(ultimo).toISOString() : null,
    entregues,
    lidos,
    falhas,
  };
}
