import type { StyleSpecification } from "maplibre-gl";

/**
 * O ESTILO DO MAPA — raster do OpenStreetMap, sem chave e sem tile vetorial.
 *
 * ═══ POR QUE RASTER, E NÃO VETOR ══════════════════════════════════════════
 *
 * O MapLibre é um renderizador vetorial, e o caminho "bonito" seria um
 * `style.json` de tiles vetoriais (`application/vnd.mapbox-vector-tile`). Só
 * que tile vetorial pronto de verdade — com camadas de rua, nome e hierarquia —
 * não existe de graça: ou é um provedor com chave (MapTiler, Stadia, Mapbox),
 * ou é um servidor de tiles próprio, que a instalação pequena não tem.
 *
 * A decisão de produto desta casa é custo de licença zero e instalação que
 * funciona no primeiro `docker compose up` (ver ADR-0003). Raster do OSM
 * entrega isso: a mesma cartografia que a operação já conhece, servida pelo
 * mesmo domínio, sem chave. Quando o self-hoster subir tile vetorial próprio,
 * o que muda é este arquivo — o componente consome `estiloOsm()` e não sabe
 * quem serve o tile.
 *
 * ═══ A URL SEM `{s}` NÃO É DETALHE ════════════════════════════════════════
 *
 * O padrão antigo (`{s}.tile.openstreetmap.org`) resolve TRÊS nomes DNS
 * (a/b/c). A própria OSM recomenda o domínio único desde que desativou o
 * balanceamento por subdomínio: uma conexão reaproveitada é mais rápida que
 * três handshakes numa rede móvel. Medido no Pixel 7 em 04/11/2026: os tiles
 * de `a.` e `b.` voltavam `ERR_ABORTED` no primeiro desenho e a cabine abria
 * com o mapa pela metade. É por isso que `TILES_OSM` não tem `{s}` — e o teste
 * `lib/mapas/estilo.test.ts` reprova quem reintroduzir.
 */
export const TILES_OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

/**
 * A atribuição é OBRIGATÓRIA pela licença ODbL: sem ela o mapa não pode ser
 * exibido. Fica no `source` porque é de lá que o `AttributionControl` do
 * MapLibre a lê — escrever à mão no rodapé da tela não conta.
 */
export const ATRIBUICAO_OSM =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const ZOOM_MINIMO = 3;
export const ZOOM_MAXIMO = 19;

/**
 * O primeiro enquadramento, antes de qualquer dado chegar.
 *
 * Canoinhas/SC — a operação que originou o módulo. NÃO é regra de negócio: é
 * só o lugar onde o mapa abre quando não há nenhuma coordenada para enquadrar
 * (carga vazia, endereços sem geocodificação). Assim que existe um ponto, o
 * `fitBounds` manda.
 */
export const CENTRO_PADRAO = { lat: -26.17, lng: -50.39, zoom: 11 };

/**
 * O objeto de estilo que o `MapLibre` recebe.
 *
 * `tileSize: 256` é obrigatório: o default do MapLibre é 512, e declarar 512
 * para um tile de 256 faz o mapa achar que cada imagem cobre o dobro do
 * terreno — o resultado é o mundo repetido em miniatura.
 */
export function estiloOsm(): StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: [TILES_OSM],
        tileSize: 256,
        minzoom: ZOOM_MINIMO,
        maxzoom: ZOOM_MAXIMO,
        attribution: ATRIBUICAO_OSM,
      },
    },
    layers: [
      {
        id: "osm",
        type: "raster",
        source: "osm",
      },
    ],
  };
}
