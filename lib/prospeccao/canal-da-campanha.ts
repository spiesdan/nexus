/**
 * QUAL SESSÃO PODE FALAR POR ESTA CAMPANHA — a pergunta é de capability, não de
 * provider.
 *
 * O motor antigo pegava a primeira sessão WORKING da organização. Com um número
 * oficial e um QR conectados, a campanha de texto podia cair no oficial: a API
 * aceita o POST (200 + wamid) e a Meta recusa a ENTREGA (131047, janela de 24h
 * fechada). O CRM dizia "enviado" e o cliente não recebia.
 *
 * A regra deste módulo é pequena de propósito: campanha `template` precisa de
 * um canal que `requiresTemplates`; campanha `texto` precisa de um canal que
 * `freeformOutsideWindow`. Quem decide o que cada provider permite é
 * `lib/channels/capabilities.ts` — aqui só se lê a resposta.
 */
import {
  capabilitiesOf,
  DEFAULT_CHANNEL_PROVIDER,
  type ChannelProvider,
} from "@/lib/channels";

import type { TipoDaMensagem } from "./mensagem-da-campanha";

export interface SessaoDaCampanha {
  id: string;
  provider?: string | null;
  daily_message_limit?: number | null;
}

function providerSeguro(provider: string | null | undefined): ChannelProvider {
  if (provider === "waha" || provider === "meta_cloud" || provider === "zernio") {
    return provider;
  }
  // Linha antiga/teste sem a coluna: o default da coluna é o canal conservador.
  return DEFAULT_CHANNEL_PROVIDER;
}

/** O canal aceita ESTE tipo de mensagem fora da janela de 24h? */
export function canalAceitaTipo(
  sessao: SessaoDaCampanha,
  tipo: TipoDaMensagem,
): boolean {
  return providerAceitaTipo(sessao.provider, tipo);
}

/** A mesma pergunta para um provider ainda sem sessão (ex.: conexão parada). */
export function providerAceitaTipo(
  provider: string | null | undefined,
  tipo: TipoDaMensagem,
): boolean {
  const caps = capabilitiesOf(providerSeguro(provider));
  return tipo === "template" ? caps.requiresTemplates : caps.freeformOutsideWindow;
}

/**
 * A primeira sessão compatível, na ordem em que o banco devolveu.
 *
 * `null` é um estado legítimo e visível: não há canal conectado que fale deste
 * jeito. O tick registra o motivo na campanha (`ultimo_erro`) em vez de tentar
 * por um canal que a plataforma vai recusar.
 */
export function escolherSessaoDaCampanha(
  sessoes: readonly SessaoDaCampanha[],
  tipo: TipoDaMensagem,
): SessaoDaCampanha | null {
  return sessoes.find((s) => canalAceitaTipo(s, tipo)) ?? null;
}
