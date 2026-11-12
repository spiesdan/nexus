/**
 * O PROVEDOR DE ROTEAMENTO — Leaflet desenha, o provedor calcula.
 *
 * A interface existe para o cálculo não ficar acoplado a um serviço: hoje
 * OSRM (ruas de verdade, sem chave), amanhã GraphHopper/ORS/Google sem tocar
 * a rota nem a tela. Quem chama nunca distingue "rua" de "fallback": a
 * proposta carrega o `provedor` e a tela mostra quando NÃO é rua (§54).
 */

export interface Coordenada {
  lat: number;
  lng: number;
}

export interface PropostaDeRota {
  /** Ordem dos índices de entrada (0 = origem quando incluída). */
  ordem: number[];
  distanciaM: number;
  duracaoS: number;
  /** GeoJSON LineString ([lng,lat]) para desenhar — vazio no fallback. */
  geometria: number[][];
  provedor: string;
  ruas: boolean;
}

export interface RoutingProvider {
  readonly nome: string;
  /** Rota pelas ruas entre pontos NA ORDEM dada. */
  rota(pontos: Coordenada[]): Promise<PropostaDeRota>;
  /**
   * Melhor sequência (origem fixa no índice 0; `retornar` fecha o ciclo).
   * O provedor que não otimiza devolve a ordem de entrada com ruas=false.
   */
  otimizar(pontos: Coordenada[], retornar: boolean): Promise<PropostaDeRota>;
}

/** Haversine em metros — o fallback honesto quando a rua está fora do ar. */
export function haversineM(a: Coordenada, b: Coordenada): number {
  const r = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(s));
}

/**
 * A ORDEM QUE O MOTORISTA CONSEGUE SEGUIR — base primeiro, depois cada parada
 * seguida da mais próxima da ANTERIOR, e uma passada de 2-opt para desfazer
 * cruzamentos.
 *
 * Era radial ("do mais perto da base ao mais longe") e é isso que mandava
 * atravessar a cidade no meio do trajeto. Medido na carga 039 (12/11/2026),
 * com as coordenadas já corretas: a parada 4 (PRIME, Centro) mandava para a 5
 * (BRTECH, Industrial 1) — 3,0 km para o outro lado — porque as duas estão a
 * ~2 km da base em direções opostas. Distância até a base não é distância
 * entre paradas; o romaneio que o dono da loja lê é o do caminho.
 *
 * O vizinho-mais-próximo sozinho ainda guarda um trecho longo para o fim (a
 * última parada fica longe de todas as outras): na mesma carga, o último
 * trecho era PAPE → BRTECH, 4,0 km. O 2-opt troca a ordem de trechos enquanto
 * o caminho encurtar; a base continua fixa no índice 0.
 *
 * Determinístico, em linha reta e sem rede: a rua é desenhada depois por quem
 * chama, e a tela diz qual provedor respondeu.
 */
export function ordenarPorMenorTrajeto(pontos: Coordenada[], retornar: boolean): number[] {
  if (pontos.length <= 2) return vizinhoMaisProximo(pontos, retornar);
  const ordem = vizinhoMaisProximo(pontos, false);
  const n = ordem.length;
  const em = (i: number) => pontos[ordem[i]!]!;
  // O 2-opt é ganancioso e cada volta pode abrir outra melhoria; o teto de
  // voltas existe para o pior caso (200 paradas) não virar laço infinito.
  let melhorou = true;
  let voltas = 0;
  while (melhorou && voltas < 40) {
    melhorou = false;
    voltas += 1;
    for (let i = 1; i < n - 1; i++) {
      for (let k = i + 1; k < n; k++) {
        const a = em(i - 1);
        const b = em(i);
        const c = em(k);
        const d = k + 1 < n ? em(k + 1) : retornar ? pontos[0]! : null;
        const antes = haversineM(a, b) + (d ? haversineM(c, d) : 0);
        const depois = haversineM(a, c) + (d ? haversineM(b, d) : 0);
        if (depois < antes - 0.5) {
          // Inverte o trecho i..k: é o movimento do 2-opt, e é o que tira o
          // cruzamento sem mexer na base.
          const trecho = ordem.slice(i, k + 1).reverse();
          ordem.splice(i, trecho.length, ...trecho);
          melhorou = true;
        }
      }
    }
  }
  if (retornar) ordem.push(0);
  return ordem;
}
/**
 * Vizinho mais próximo a partir da origem (índice 0). Sozinho não é ótimo —
 * é o ponto de partida do `ordenarPorMenorTrajeto` e o plano B documentado
 * quando o OSRM não responde (§54): melhor que a ordem de digitação, pior que
 * a rua, e a tela diz qual é.
 */
export function vizinhoMaisProximo(pontos: Coordenada[], retornar: boolean): number[] {
  if (pontos.length <= 1) return pontos.map((_, i) => i);
  const restantes = new Set(pontos.slice(1).map((_, k) => k + 1));
  const ordem = [0];
  let atual = 0;
  while (restantes.size > 0) {
    let melhor = -1;
    let melhorD = Infinity;
    for (const cand of restantes) {
      const d = haversineM(pontos[atual]!, pontos[cand]!);
      if (d < melhorD) {
        melhorD = d;
        melhor = cand;
      }
    }
    ordem.push(melhor);
    restantes.delete(melhor);
    atual = melhor;
  }
  if (retornar) ordem.push(0);
  return ordem;
}

/**
 * A ORDEM COMPLETA — as paradas roteirizadas e as que ficaram sem mapa.
 *
 * O cálculo do servidor só devolve posição para quem tem coordenada; as
 * demais voltam em `nao_roteirizaveis`. A tela precisa das duas listas: o
 * PATCH /rota/ordem recusa cobertura parcial ("a ordem precisa cobrir todas
 * as paradas"), então usar só a primeira metade sumia com as paradas sem
 * mapa da lista E fazia o "Salvar ordem" falhar depois de otimizar.
 *
 * Quem não tem coordenada vai para o FIM, na ordem em que o servidor as
 * devolveu: é onde a operação as trata — corrigir o endereço ou marcar no
 * mapa — sem contaminar a sequência calculada.
 */
export function ordemCompleta(ordem: readonly string[], naoRoteirizaveis: readonly string[]): string[] {
  const vistas = new Set(ordem);
  return [...ordem, ...naoRoteirizaveis.filter((c) => !vistas.has(c))];
}

/** "42,8 km" / "1h32" — o resumo da rota fala como gente. */
export function formatarDistancia(metros: number): string {
  if (metros < 1000) return `${Math.round(metros)} m`;
  return `${(metros / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
}

export function formatarDuracao(segundos: number): string {
  const min = Math.round(segundos / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r === 0 ? `${h}h` : `${h}h${String(r).padStart(2, "0")}`;
}
