import type { Look } from "./engine";

/**
 * Para ONDE o bloub olha quando segue o cursor.
 *
 * Portado de `src/ui/gaze.ts` do bloub (MIT), com duas mudanças de contexto:
 * o assistente flutua no canto da tela — não há painel de settings à esquerda
 * para o `-TURN` da origem — e não há sequência de chegada, logo o `spin`
 * (o "tour" de entrada) fica fora. O que permanece é a régua medida lá:
 * amplitudes escolhidas, a altura de repouso ABSOLUTA e o sentido dos eixos.
 */

/**
 * Ângulos em graus de orientação de cabeça. ESCOLHIDOS lá: amplos o bastante
 * para se distinguir da deriva do repouso (±7° de guinada, ±5,5 de balanço),
 * retidos o bastante para nenhum olho partir atrás do limbo da esfera.
 */
export const YAW_MAX = 16;
export const PITCH_MAX = 13;

/**
 * Altura em que o olhar se põe com o cursor no centro. ESCOLHIDA: um pouco
 * acima do equador, o que dá um bot atento em vez de ausente. É um valor
 * ABSOLULO — em relativo, a altura dos olhos seguia a de cada expressão e eles
 * tombavam de uma vez na primeira troca de humor.
 */
export const PITCH = 10;

export interface Mirada {
  /** Desvio horizontal do cursor ao centro do bot, -1 a 1 (direita positiva). */
  nx: number;
  /** Desvio vertical no sentido da tela, -1 a 1 (baixo positivo). */
  ny: number;
}

/**
 * Alvo de olhar para o cursor. Puro, sem DOM: a posição já chega normalizada,
 * então a régua se testa sozinha — e ela precisa ser testada, porque dois
 * sinais aí se trocam com facilidade.
 *
 * `mix: 1` diz que o EXTERIOR manda a direção o tempo todo (o motor faz o
 * morph do olhar em 0,24s); `wander: 0` desliga a deriva do repouso enquanto
 * o ponteiro estiver vivo, senão o bot pareceria procurar o cursor sem nunca
 * agarrá-lo.
 */
export function olharPara({ nx, ny }: Mirada): Look {
  return {
    // guinada positiva = para a direita; `ny` do mundo desce, então o tangage
    // (positivo = para cima) é a altura de repouso MENOS o desvio de tela
    yaw: nx * YAW_MAX,
    pitch: PITCH - ny * PITCH_MAX,
    mix: 1,
    spin: 0,
    wander: 0,
  };
}
