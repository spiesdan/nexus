# 61 — P1-3: lista e mapa apontam para a mesma parada

**Data:** 23/11/2026 · **Base:** `nexus/main@d36d494bb` · **Rotas medidas:** Cargas 010 e 061, aba Rota.

## O que mudou

- `MapaRota` ganhou `aoSelecionar(chave)` e `selecionada`. Clicar num pino avisa a lista; clicar numa linha destaca o pino (tamanho 34→38 px + anel).
- Cada marcador carrega `data-chave`; a linha da lista carrega `data-linha-parada`. Quando a seleção vem do mapa, a linha entra em vista (`scrollIntoView({block:"nearest"})`) e ganha `bg-accent-soft`.
- **Precisão do pino** sem mexer na cor da entrega: `confirmada` = borda branca sólida; `aproximada` = borda branca tracejada. `COR_ESTADO` continua intacta — pendente/proxima/atendimento/entregue/problema mantêm as cores. Legenda abaixo do mapa nomeia os dois contornos.
- A precisão vem de `geo_status === "ok" && !pinoAproximado(geo_fonte)`, a mesma regra que a lista já usa no texto “aproximado”.

## Prova (4 combinações por rota, claro/escuro × 1440/390)

| Rota | Contraste | Overflow | Console | axe |
| --- | --- | --- | --- | --- |
| Carga 010 (`dd3e6cbf`) | 0 | 0 px | 0 | 0 crítico · 2 sérios* |
| Carga 061 (`b406f296`) | 0 | 0 px | 0 | 0/0 |

\* `link-in-text-block` no link de atribuição do OpenStreetMap (`maplibregl-ctrl-attrib-inner`), controle de terceiros do MapLibre — pré-existente e fora deste passe.

Interação verificada no navegador: clicar na primeira linha destaca a linha (`bg-accent-soft`) e o pino correspondente (`box-shadow` de destaque); a legenda “Pino confirmado / Pino aproximado” está presente nos dois temas.

Capturas: `capturas/{antes,depois}-mapa-lista/` · medições `capturas/medicao-mapa-lista*/varredura.json`.

Servidor e Chromium mortos ao fim. Nenhum merge feito neste PR — aguardando liberação do coordenador para a 1.63.0.
