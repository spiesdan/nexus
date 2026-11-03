/**
 * A RESTRIÇÃO DE ALCANCE de um canal — lida pelo seam, para que nenhuma feature
 * precise perguntar QUAL é o provider.
 *
 * ═══ O que é ═══════════════════════════════════════════════════════════════
 *
 * Algumas plataformas limitam o aparelho vinculado a ABRIR conversa nova por um
 * período (o WhatsApp chama isso de `reachoutTimelock`). Enquanto vale, mensagem
 * para quem já conversa continua saindo; conversa nova, não. E insistir durante
 * a restrição é o que faz a plataforma remover o aparelho.
 *
 * ═══ Por que mora aqui, e não na prospecção ════════════════════════════════
 *
 * Porque descobrir a restrição exige (a) saber qual é a coluna do identificador
 * da sessão naquele provider e (b) saber perguntar ao transporte. As duas coisas
 * são o invariante 1 da doutrina de restrição de canal: feature não nomeia
 * provider. A prospecção pede "esta sessão está restrita?" e recebe a resposta —
 * a mesma pergunta que qualquer outra feature pode fazer amanhã.
 *
 * ═══ A leitura vai no contrato de SAÚDE, não num método novo ═══════════════
 *
 * `checkHealth` já responde "a credencial presta e o canal está de pé", e a
 * restrição vem na MESMA resposta do transporte. Um método próprio custaria uma
 * segunda rodada de rede para uma pergunta que a primeira já trouxe — e as duas
 * poderiam discordar entre si justamente na janela em que a decisão de mandar
 * precisa ser firme.
 *
 * ═══ Falhar ABERTO ═════════════════════════════════════════════════════════
 *
 * Sessão que não existe mais, provider sem `checkHealth`, transporte fora do ar:
 * tudo devolve `null` (sem restrição conhecida). Não é descuido — é o mesmo
 * critério do vigia de conexões, e a alternativa (tratar "não deu para
 * perguntar" como "restrito") faria uma oscilação de rede de dois segundos
 * congelar a operação inteira.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { RestricaoDeAlcance } from "@/lib/waha/client";

import { getAdapter } from "./index";
import {
  CHANNEL_SESSION_REF_COLUMNS,
  resolveSessionRef,
  type ChannelSessionRef,
} from "./session-ref";
import type { ChannelProvider } from "./types";

export type { RestricaoDeAlcance };

export interface ConsultaDeRestricao {
  admin: SupabaseClient;
  /** `channel_sessions.id` — a sessão do CRM, não o nome dela no transporte. */
  channelSessionId: string;
  /** Injeção para o teste: o instante contra o qual o prazo é comparado. */
  agoraMs?: number;
}

/**
 * A restrição ATIVA agora nesta sessão, ou `null`.
 *
 * Consulta o transporte na hora, não o estado gravado: o banco carrega a idade
 * da última varredura (5 min no melhor caso) e a janela entre "restrição
 * aplicada" e "aparelho removido" foi de 3 SEGUNDOS no incidente que originou
 * esta função. Decisão tomada com dado de 5 minutos atrás não protege nada.
 */
export async function restricaoDeAlcanceDaSessao({
  admin,
  channelSessionId,
  agoraMs = Date.now(),
}: ConsultaDeRestricao): Promise<RestricaoDeAlcance | null> {
  const { data } = await admin
    .from("channel_sessions")
    .select(`organization_id, ${CHANNEL_SESSION_REF_COLUMNS}`)
    .eq("id", channelSessionId)
    .maybeSingle();
  if (!data) return null;

  const linha = data as unknown as ChannelSessionRef & { organization_id: string };
  try {
    const adapter = getAdapter(linha.provider as ChannelProvider);
    if (!adapter.checkHealth) return null;
    const saude = await adapter.checkHealth({
      organizationId: linha.organization_id,
      sessionRef: resolveSessionRef(linha),
    });
    const restricao = saude.restricaoDeAlcance ?? null;
    if (!restricao) return null;
    // Sem prazo informado não dá para dizer "já passou", e mandar durante a
    // restrição é o que derruba o aparelho. Trata como ativa.
    if (restricao.terminaEm === null) return restricao;
    return Date.parse(restricao.terminaEm) > agoraMs ? restricao : null;
  } catch {
    // Provider desconhecido, transporte fora do ar, resposta torta: segue.
    return null;
  }
}
