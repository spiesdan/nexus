# ADR-0003 — MapLibre no mapa da expedição (suplantando ADR-0002)

- **Status:** aceito
- **Data:** 2026-11-13
- **Suprime:** ADR-0002 (peça "Mapa" passa de Leaflet para MapLibre GL JS)
- **Decisão de produto:** manter a stack geográfica livre, autohospedável, custo de licença zero; apenas a biblioteca de desenho do mapa da expedição muda
- **Runbook:** [`docs/runbooks/geodados.md`](../runbooks/geodados.md) (atualizado para citar o ADR-0003)
- **Mapa:** [`docs/architecture/expedicao-vrptw.architecture.json`](../architecture/expedicao-vrptw.architecture.json) (atualizado para MapLibre)

---

## Contexto

O módulo Expedição nasceu com o mapa em **Leaflet** (ADR-0002), isolado em
`app/app/expedicao/[id]/_mapa-rota.tsx` justamente para permitir futura troca de
biblioteca. O dono do produto decidiu trocar por **MapLibre GL JS**, sugerido já no
prompt de requisitos (§1.1).

A cartografia continua a mesma: tiles raster do OpenStreetMap, sem chave, sem conta,
sem custo de licença. O que muda é só o renderizador — e o custo disso está listado
abaixo em "Custos aceitos".

### Por que trocar, se a cartografia não muda

- **MapLibre é da mesma família de licença (BSD)** que o Leaflet: não introduz
  fornecedor pago nem chave.
- **Desenho em WebGL**: o mapa, as linhas de rota e os pinos não passam pelo DOM como
  elementos por parada — pan e zoom são desenhados na GPU. Hoje o **tile continua
  raster** (ver "Estilo raster, não vetorial"); o ganho de estilo vetorial só aparece
  quando houver servidor de tile vetorial próprio.
- O Leaflet continua instalado e **segue sendo usado na prospecção**
  (`app/app/prospeccao/_mapa.tsx`), que não foi migrada — não há motivo para tocar
  numa tela que não está neste escopo.

---

## Decisão

| Peça | Antes (ADR-0002) | Depois (ADR-0003) | Papel |
|---|---|---|---|
| Mapa | **Leaflet** | **MapLibre GL JS 6.18.0** | desenhar mapa, pinos, rota por veículo, trajeto do motorista |
| Cartografia | OpenStreetMap (tiles) | OpenStreetMap (tiles, raster) | dados de ruas e lugares |
| Geocodificação | Nominatim | Nominatim (inalterado) | endereço → lat/lng |
| Roteamento | OSRM | OSRM (inalterado) | `route` e `table` |

Nenhuma das três últimas peças exige chave, assinatura ou licença paga. Todas seguem
rodando em contêiner e configuradas por variável de ambiente (`NOMINATIM_URL`,
`OSRM_URL`), nunca por edição de código.

### O que foi reescrito no código

- `app/app/expedicao/[id]/_mapa-rota.tsx` — reescrito do zero para MapLibre:
  - estilo inline `estiloOsm()` (raster OSM, `{z}/{x}/{y}`, tileSize 256, sem `{s}`,
    sem `access_token`, com atribuição ODbL na fonte);
  - fontes GeoJSON + camadas `line` (contorno branco + cor, `line-dasharray [2,2]`),
    `fill` + `line` para o círculo de precisão do GPS;
  - `maplibregl.Marker` (âncora `bottom`, pino arrastável, popup com
    `popup.on("open")` para os botões Cheguei/Entregue);
  - `fitBounds` no primeiro enquadramento, `easeTo` no modo "seguindo você",
    `dragstart` desliga o follow, `ResizeObserver` + `m.resize()`, `remove()` na
    desmontagem (StrictMode);
  - `refEstiloPronto` / `refDesenhoPendente` para desenhar só depois do `load`;
  - classe `relative isolate z-0` preservada (gate de stacking context).
- `lib/mapas/estilo.ts` + `lib/mapas/geometria.ts` — helpers puros (estilo raster,
  linha de rota, polígono de precisão em metros, limites), com 14 testes sem browser
  (`estilo.test.ts` 4, `geometria.test.ts` 10).
- Gate `tests/unit/mapas-em-contexto-de-stack.test.ts` — varre quem instancia mapa
  (`L.map(` / `new maplibregl.Map(`) e exige `isolate` ou `z-0` no contêiner.
- Gate `tests/unit/mapa-da-expedicao-e-maplibre.test.ts` — 10 casos: importação
  MapLibre (não Leaflet), estilo de `lib/mapas/estilo`, geometria de
  `lib/mapas/geometria`, enquadramento que respeita o dedo, popup com ações, pino
  arrastável, ResizeObserver + `remove()`, stacking context.

### O que NÃO mudou (pago com defeito medido em operação)

- enquadramento que não briga com o dedo do motorista (`refArrastou`);
- `ResizeObserver` que corrige mapa nascido com altura 0;
- popup com as ações de entrega;
- pino arrastável do modo "marcar no mapa";
- "você está aqui" como ponto azul com anel, não caminhãozinho.

---

## Custos aceitos (documentados para não serem redescobertos)

### Worker do MapLibre

O MapLibre carrega um Web Worker (`maplibre-gl-worker.mjs`) resolvido a partir de
`import.meta.url` do bundle. Em empacotamentos onde o worker não fica ao lado do
bundle (por exemplo, um único bundle IIFE servido por um servidor de arquivos
estático), o worker falha com "non-JavaScript MIME type" e fontes GeoJSON (rotas)
não indexam — não pintam, mesmo com `addSource`/`addLayer` criados corretamente.

**Correção:** chamar `maplibre-gl.setWorkerUrl(...)` para um caminho explícito e
garantir que o worker seja servido. Na bancada de prova visual
(`tests/visual/expedicao/`), o worker é copiado para o diretório de saída e a bancada
aponta `setWorkerUrl("/maplibre-gl-worker.mjs")`. Em produção (Next.js), o worker
fica no build estático e resolve sozinho — nenhum `setWorkerUrl` é necessário lá.

### Estilo raster, não vetorial

O MapLibre é um renderizador vetorial, mas o estilo desta casa é raster OSM: não
existe tile vetorial pronto e grátis com cartografia de rua (ou é pago — MapTiler,
Stadia, Mapbox — ou exige servidor de tiles próprio, que a instalação pequena não
tem). Quando o self-hoster quiser tile vetorial, o que muda é só `lib/mapas/estilo.ts`
— o componente consome `estiloOsm()` e não sabe quem serve o tile.

---

## Alternativas avaliadas e por que não (nesta entrega)

### Manter Leaflet na expedição

Rejeitado: pedido explícito do dono do produto ("mude para maplibre"). Leaflet
permanece na prospecção, que não está neste escopo.

### Tile vetorial (MapTiler/Stadia/Mapbox)

Rejeitado: chave em produção, custo por requisição e dependência de fornecedor — o
exato oposto da decisão de produto (custo zero, autohospedado).

---

## Consequências

### Positivas

- Mesma cartografia OSM que a operação já conhece; sem chave, sem conta, sem cobrança.
- MapLibre continua BSD, igual ao Leaflet: nenhum fornecedor pago entra na stack.
- Desenho em WebGL: camada de rota e pinos desenhados na GPU, sem um elemento de DOM
  por parada. Com os tiles raster de hoje, isso vale para pan/zoom e para as linhas —
  a troca para cartografia vetorial é uma decisão separada (`lib/mapas/estilo.ts`).

### Negativas / custos que passam a existir

- **Worker**: empacotamentos não-padrão precisam de `setWorkerUrl` + worker servido
  (documentado acima). A bancada de prova visual já cobre isso.
- **Duas bibliotecas de mapa no repo**: Leaflet (prospecção) e MapLibre (expedição).
  O gate de stacking varre ambas por instância, não por biblioteca — não vale vigiar
  só o `import "leaflet"`.

---

## O que esta decisão NÃO resolve

Está registrado para não ser confundido com "feito":

- **Agrupamento de marcadores, seleção de pedido pelo mapa e filtros no mapa**: não
  implementados (continua do ADR-0002).
- **Validação de "ponto perto de via roteável" (Nearest API)**: não usada.
- **Prospecção em Leaflet**: segue inalterada; não há plano de migrá-la neste ciclo.
