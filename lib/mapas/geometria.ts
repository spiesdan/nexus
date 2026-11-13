/**
 * GEOMETRIA DO MAPA — as contas que dão forma ao que o MapLibre desenha.
 *
 * Tudo aqui é função pura que devolve GeoJSON: nada toca em DOM, em mapa ou em
 * `window`. O motivo é o de sempre: o que dá para testar sem browser é testado
 * sem browser, e o componente que desenha fica só com o que só ele pode fazer
 * (criar fonte, camada, marcador e popup).
 *
 * Convenção de eixo, a mesma do GeoJSON e a mesma do MapLibre: **`[lng, lat]`**.
 * A regra da casa é que a conversão de `[lat, lng]` (formato do GPS, do banco e
 * do Leaflet) acontece aqui, uma vez, e nunca no meio do componente — trocar
 * dois números é o erro que põe a entrega no oceano Índico e não gera erro
 * nenhum.
 */

export type Coordenada = [number, number];

/** Um ponto do GeoJSON — sempre `[lng, lat]`. */
export interface FeatureLinha {
  type: "Feature";
  properties: Record<string, never>;
  geometry: { type: "LineString"; coordinates: Coordenada[] };
}

export interface FeaturePoligono {
  type: "Feature";
  properties: Record<string, never>;
  geometry: { type: "Polygon"; coordinates: Coordenada[][] };
}

/** Um par de cantos no formato que `map.fitBounds` espera. */
export type Limites = [Coordenada, Coordenada];

function valida(lng: unknown, lat: unknown): boolean {
  return (
    typeof lng === "number" &&
    typeof lat === "number" &&
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

/**
 * Converte a geometria da rota (GeoJSON `[lng,lat]`, como o OSRM entrega) em
 * uma `Feature` de linha.
 *
 * Coordenada inválida é DESCARTADA, não convertida em `NaN`: um único `NaN` no
 * meio do array faz o MapLibre recusar a fonte inteira e a rota desaparecer sem
 * mensagem. Perder um ponto é degradação visível (a linha fica com um trecho
 * reto); perder a linha inteira é o mapa em branco.
 *
 * Menos de dois pontos não é linha — devolve `null`, e quem chamou não cria
 * camada nenhuma (uma `LineString` de um ponto é erro de spec, não desenho).
 */
export function linhaDeRota(geometria: number[][] | null | undefined): FeatureLinha | null {
  if (!geometria) return null;
  const coordinates = geometria
    .filter((c) => Array.isArray(c) && valida(c[0], c[1]))
    .map((c) => [c[0] as number, c[1] as number] as Coordenada);
  if (coordinates.length < 2) return null;
  return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } };
}

/**
 * O CÍRCULO DE PRECISÃO DO GPS, como polígono em metros.
 *
 * O MapLibre não tem "círculo de raio em metros" como o Leaflet tinha
 * (`L.circle`, que resolve isso por projeção). O jeito suportado é desenhar um
 * polígono — e é isso que este helper faz, com a conta de superfície:
 *
 *   - 1 grau de latitude ≈ 111.320 m em qualquer lugar do planeta;
 *   - 1 grau de longitude encolhe com o cosseno da latitude (no polo vale ~0).
 *
 * Sem o cosseno, o "círculo" de 60 m em Canoinhas (26° S) sairia ~11% largo — e
 * num GPS de celular, onde o círculo é a única indicação de "não confie neste
 * ponto", elipse disfarçada de círculo é informação errada.
 *
 * O anel é FECHADO (primeiro ponto repetido no fim): polígono aberto não pinta
 * no MapLibre.
 */
export function poligonoDePrecisao(
  lat: number,
  lng: number,
  raioMetros: number,
  lados = 48,
): FeaturePoligono | null {
  if (!valida(lng, lat) || !Number.isFinite(raioMetros) || raioMetros <= 0) return null;
  const n = Math.max(12, Math.floor(lados));
  const dLat = raioMetros / 111_320;
  // `cos(90°)` é ~6e-17: sem o piso, a divisão estoura e o anel vira `NaN`.
  const cosseno = Math.max(Math.abs(Math.cos((lat * Math.PI) / 180)), 1e-6);
  const dLng = raioMetros / (111_320 * cosseno);
  const anel: Coordenada[] = [];
  for (let i = 0; i < n; i++) {
    const angulo = (2 * Math.PI * i) / n;
    anel.push([lng + dLng * Math.cos(angulo), lat + dLat * Math.sin(angulo)]);
  }
  anel.push(anel[0] as Coordenada);
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [anel] } };
}

/**
 * A caixa que contém todos os pontos — `[[minLng,minLat],[maxLng,maxLat]]`.
 *
 * É o que o enquadramento usa. Devolve `null` quando não há nenhum ponto
 * válido; devolver uma caixa degenerada faria o `fitBounds` dar zoom no vazio.
 */
export function limitesDe(pontos: Coordenada[]): Limites | null {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of pontos) {
    if (!valida(lng, lat)) continue;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  if (!Number.isFinite(minLng)) return null;
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}
