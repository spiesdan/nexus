# Prova visual — módulo Expedição (MapLibre)

Este diretório guarda as capturas de tela dos componentes de **produção** da
expedição, geradas em bancada bundlada (esbuild + Tailwind) com `fetch` falso —
sem app, sem Supabase, sem banco. Nenhum dado real de cliente aparece aqui: as
fixtures são sintéticas (nomes e endereços inventados de Canoinhas/SC).

## Como as imagens foram geradas

1. `node tests/visual/expedicao/build.mjs <dir>` — constrói o bundle da
   bancada (`bancada.js`, `bancada.css`), o CSS do produto (Tailwind 4),
   copia o worker do MapLibre (`maplibre-gl-worker.mjs`) e escreve o `index.html`
   (moldura de iframe 1680×1600) + `bancada.html` (a tela).
2. Sirve `<dir>` com qualquer servidor estático (ex.: `python3 -m http.server
   --directory <dir> 8000`) e abra `http://localhost:8000/`.
3. O print é **full page** da moldura com o iframe de 1680px de largura, para
   que as media queries `xl` da expedição sejam as certas.

O build **não é versionado** — só as imagens são. Rebuildar sempre que o código
do mapa ou dos painéis mudar.

## Arquivos

| Arquivo | O que mostra |
|---|---|
| `rota-mapa-no-topo.jpeg` | **Layout atual (1.52.2).** Cabeçalho da seção, faixa de números (entregas, no mapa, distância, tempo, mercadorias) e o **mapa grande no topo** (1648×640 na moldura). Abaixo, os três painéis de trabalho: ordem de entrega, planejamento e recuperação/distribuição. É a prova de que o mapa deixou de ser coluna do meio. |
| `mapa-rotas-veiculo.png` | Layout anterior (1.52.0/1.52.1) em três colunas: mapa no centro, com os números flutuando sobre ele. Guardado para comparar a mudança. |
| `recuperacao-colapsado.png` | Layout anterior, com o painel de recuperação **colapsado** (toggle "2 endereços resolvidos" fechado). |

## Viewport

A moldura tem `1680 × 1600` px. A bancada renderiza dentro do iframe, então a
largura real usada pelo componente é 1680px — o mesmo que o operador vê no
painel `xl`.

## Fixtures

Todas em `tests/visual/expedicao/fixtures.ts`: 9 paradas, 3 veículos (van,
furgão, utilitário), 3 motoristas, distribuição achatada veículo 1 → 2 → 3,
geometria de rua sintética e 4 casos de recuperação de endereços
(`ambíguo`, `não_encontrado`, `recuperado`, `encontrado`). O `fetch` falso
(`tests/visual/expedicao/fetch-falso.ts`) responde `{ data: ... }` nas mesmas
URLs que a API real (`/rota/recuperacoes`, `/shipments/{id}/rota`,
`/api/v1/fleet`).

## Por que não é um teste de browser

A prova visual valida o que o pixel mostra; o gate de regressão continua no
código-fonte (`tests/unit/mapa-da-expedicao-e-maplibre.test.ts` e
`tests/unit/mapas-em-contexto-de-stack.test.ts`), que vigiam a forma do mapa
sem precisar de navegador. A prova visual não é gate de CI — é evidência para
quem instala ou revisa o produto.
