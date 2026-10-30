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
  CHANNEL_CAPABILITIES,
  DEFAULT_CHANNEL_PROVIDER,
  type ChannelProvider,
} from "@/lib/channels";
import { normalizarQualidade } from "@/lib/channels/number-quality";

import type { TipoDaMensagem } from "./mensagem-da-campanha";

export interface SessaoDaCampanha {
  id: string;
  provider?: string | null;
  daily_message_limit?: number | null;
  /**
   * Última qualidade lida da plataforma (`GREEN`/`YELLOW`/`RED`/`UNKNOWN`).
   * `null`/ausente = o canal não responde essa pergunta — é o caso de TODO
   * número por QR: a Meta não publica nota de qualidade para número pareado
   * fora da API oficial.
   */
  quality_rating?: string | null;
  /**
   * 0288 — até quando um "Enviar agora" segura este número (lease de disparo).
   * Enquanto vale, o tick não fala por ele: o lote e o tick somados davam uma
   * mensagem a cada ~40s num número que prometeu 2min.
   */
  dispatch_locked_until?: string | null;
  /**
   * O nome da sessão no transporte (só o canal por QR tem). É por ele que se
   * pergunta a RESTRIÇÃO DE ALCANCE — ver `restricao-do-whatsapp.ts`.
   */
  waha_session_name?: string | null;
}

function providerSeguro(provider: string | null | undefined): ChannelProvider {
  // A coluna chega como texto. Validar contra a MATRIZ é o que a converte em
  // `ChannelProvider` sem escrever nome de provider aqui — e um valor que a
  // matriz não conhece NÃO herda o default de outro canal (fail-closed).
  if (provider && Object.hasOwn(CHANNEL_CAPABILITIES, provider)) {
    return provider as ChannelProvider;
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
 * A sessão está com a qualidade do NÚMERO em RED?
 *
 * Só o canal oficial tem nota — número por QR vem sem `quality_rating`, e
 * `normalizarQualidade(null)` devolve `null`, nunca `RED`. Ou seja: este gate
 * não alcança o caminho não oficial, nem por acidente. Lá a proteção é outra
 * (aquecimento + espaçamento + teto diário), porque a Meta simplesmente não
 * expõe reputação de número pareado por QR.
 */
export function sessaoComQualidadeRuim(sessao: SessaoDaCampanha): boolean {
  return normalizarQualidade(sessao.quality_rating) === "RED";
}

/**
 * A primeira sessão compatível com o tipo E sem qualidade RED.
 *
 * Pular a sessão RED (em vez de escolher a primeira compatível e parar) é o que
 * permite a organização com dois números oficiais continuar falando pelo
 * saudável. Quando TODAS as compatíveis estão em RED, a escolha devolve `null`
 * e o chamador pausa com motivo — em vez de seguir por um número que a
 * plataforma já sinalizou.
 */
export function escolherSessaoDaCampanha(
  sessoes: readonly SessaoDaCampanha[],
  tipo: TipoDaMensagem,
): SessaoDaCampanha | null {
  return sessoes.find((s) => canalAceitaTipo(s, tipo) && !sessaoComQualidadeRuim(s)) ?? null;
}

/**
 * Havia sessão compatível, e ela foi recusada SÓ pela qualidade?
 *
 * É o que distingue "não há canal para este tipo" (o operador precisa conectar
 * um número) de "o canal existe e está sinalizado" (o operador precisa corrigir
 * o conteúdo e esperar a qualidade voltar). Dois problemas, dois próximos
 * passos — dizer o primeiro quando o defeito é o segundo manda a pessoa
 * consertar o que não está quebrado.
 */
export function bloqueadaPorQualidade(
  sessoes: readonly SessaoDaCampanha[],
  tipo: TipoDaMensagem,
): boolean {
  return (
    sessoes.some((s) => canalAceitaTipo(s, tipo)) &&
    sessoes.every((s) => !canalAceitaTipo(s, tipo) || sessaoComQualidadeRuim(s))
  );
}
