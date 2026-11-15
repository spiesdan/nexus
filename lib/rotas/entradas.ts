/**
 * A ENTRADA DO ENDEREÇO — quando o número não existe (0311).
 *
 * Medido na base de produção em 15/11/2026: 49 destinos, 31 com número, 12
 * `S/N` e 6 com o campo vazio. **37% da operação não tem número de casa**, e
 * para esses endereços nenhum geocodificador devolve a porta: o Nominatim cai
 * para a rua, o bairro ou o centro da cidade. O pino erra por centenas de
 * metros — ou por quilômetros, como os 1.872 m de Canoinhas.
 *
 * Daí a regra que este módulo codifica:
 *
 *   - "sem número" é propriedade do CADASTRO, não do geocodificador. Antes de
 *     culpar o mapa, a tela precisa dizer que o número não existe.
 *   - "Tentar de novo" só faz sentido quando há número. Sem número, o botão é
 *     uma promessa que o código não pode cumprir.
 *   - o único caminho para a porta é alguém marcar a entrada — e essa marcação
 *     vale para as cargas seguintes do mesmo endereço, porque é o endereço que
 *     se repete, não a parada.
 */

/** O pino que veio de uma entrada marcada (0311) — a porta, não a rua. */
export const FONTE_ENTRADA = "entrada";

/**
 * O pino marcado à mão ANTES da 0311, quando não havia memória do endereço.
 * Continua sendo decisão de um humano, então a régua o trata como porta — mas
 * ele não tem `referencia` nem `confirmacoes`: é um ponto, não uma entrada.
 */
export const FONTE_MANUAL = "manual";

/**
 * O pino de um nó de casa do OpenStreetMap: o único geocode que já é a porta.
 * `nominatim:rua` para no meio da rua, `bairro`/`cidade` no centroide.
 */
export const FONTE_NUMERO = "nominatim:numero";

export type SituacaoDoNumero = "casa" | "km" | "sem_numero";

/**
 * O que o campo `numero` do destino realmente é.
 *
 * `KM` NÃO é "sem número": numa rodovia o marco é localização, e tratá-lo como
 * ausência joga fora a única informação útil que o endereço traz. A distinção
 * existe para a tela poder dizer "marco de km" em vez de "sem número" — e para
 * ninguém prometer ao operador que um geocode por texto livre vai achar o km.
 *
 * `S/N`, vazio e qualquer coisa sem dígito são `sem_numero`.
 */
export function situacaoDoNumero(numero: string | null | undefined): SituacaoDoNumero {
  const v = (numero ?? "").trim().toUpperCase();
  if (/^KM\b/.test(v)) return "km";
  return /\d/.test(v) ? "casa" : "sem_numero";
}

/**
 * A chave da memória de entrada: o endereço reduzido à sua forma comparável.
 *
 * Precisa ser determinística e idêntica na escrita (marcar entrada) e na
 * leitura (aplicar entrada conhecida a um destino novo), senão a memória nunca
 * casa consigo mesma. Sem acento, sem pontuação, sem CEP e sem diferença de
 * caixa: "R. Mal. Deodoro, 484 — Centro, Mafra/SC" e "Rua Marechal Deodoro 484,
 * centro, Mafra" caem na mesma chave. Abreviação NÃO é expandida aqui de
 * propósito — expandir é heurística de geocoder, e uma memória que adivinha
 * erra para o lado caro: pino na porta errada.
 *
 * A chave é do ENDEREÇO, não do cliente. Dois clientes no mesmo prédio usam a
 * mesma entrada; o mesmo cliente em duas obras usa duas.
 */
export function chaveDoEndereco(endereco: string | null | undefined): string | null {
  const bruto = (endereco ?? "").trim();
  if (!bruto) return null;
  const semAcento = bruto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const semCep = semAcento.replace(/\b\d{5}-?\d{3}\b/g, " ");
  const chave = semCep
    .toUpperCase()
    // Traços (— e –) entram porque `enderecoEmLinha` separa os componentes com
    // " — ": sem eles, o mesmo endereço gerava duas chaves e a memória errava.
    .replace(/[.,;:!?()[\]{}"'`^~|/\\·ºª—–-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Chave degenerada não é endereço, e o custo do erro é pino na porta errada.
  //
  // Dois casos, ambos de endereço SEM RUA (o campo `logradouro` vazio):
  //
  //   - o endereço é só o marcador ("S/N"), e a chave seria `S N`;
  //   - o endereço é o marcador mais bairro/cidade ("S/N — Centro, Mafra/SC"),
  //     que é como `enderecoEmLinha` monta um cadastro sem rua.
  //
  // No segundo caso a chave PARECE boa (`S N CENTRO MAFRA SC`) e duas entregas
  // sem rua nenhuma no mesmo bairro passariam a compartilhar a mesma memória: a
  // segunda herdaria a porta da primeira. Endereço de verdade começa pela rua,
  // então começar pelo marcador é o sinal de que não há rua — e sem rua não há
  // endereço para lembrar.
  const comecaComMarcador = /^(S N|SN|SEM NUMERO)\b/.test(chave);
  if (comecaComMarcador) return null;
  const semMarcador = chave.replace(/\b(S N|SN|SEM NUMERO)\b/g, "").replace(/\s+/g, " ").trim();
  return semMarcador.length >= 3 ? chave : null;
}

/** O que a parada precisa saber da entrada — o suficiente para a tela decidir. */
export interface EntradaDoEndereco {
  id: string;
  referencia: string | null;
  marcado_em: string;
  /** Quantas entregas confirmaram o ponto (memória do endereço). */
  confirmacoes: number;
  confirmado_em: string | null;
  /**
   * Quando ESTA parada foi confirmada na porta. Separado de `confirmacoes`
   * de propósito: a memória pode ter dez confirmações de outras cargas e esta
   * entrega ainda não ter sido conferida — e é essa que o motorista precisa
   * responder.
   */
  confirmada_em?: string | null;
}

/**
 * O que a tela e o resumo de despacho consultam. Recebe só o que já existe na
 * parada, para não obrigar a UI a reimplementar a régua em cada lugar.
 */
export interface ParadaParaAviso {
  numero?: string | null;
  geo_status: string;
  geo_fonte: string | null;
  entrada?: EntradaDoEndereco | null;
}

/**
 * O pino já é a porta: veio de uma entrada marcada, de um pino manual anterior
 * à 0311, ou de um nó de casa do OpenStreetMap.
 */
export function pinoEhDaPorta(p: Pick<ParadaParaAviso, "geo_status" | "geo_fonte">): boolean {
  if (p.geo_status !== "ok") return false;
  return (
    p.geo_fonte === FONTE_ENTRADA || p.geo_fonte === FONTE_MANUAL || p.geo_fonte === FONTE_NUMERO
  );
}

/**
 * A parada precisa de entrada marcada? Sim quando o pino não é a porta.
 *
 * É a régua do resumo antes de despachar e do aviso na lista. Não depende de
 * ter número: endereço COM número que só geocodificou até a rua também precisa
 * — o número existe, mas o mapa não o achou.
 */
export function precisaDeEntrada(p: ParadaParaAviso): boolean {
  if (p.entrada) return false;
  return !pinoEhDaPorta(p);
}
