# 66 — Evidência adicional do workbench (overlay e painel em rascunho)

**Data:** 23/11/2026 · **Base:** `nexus/main@1b4846543`.

## 1. Sobreposição no rodapé

A captura 1440 mostrava os selos do rodapé da sidebar ("14 na fila" em y=799 e "Nova versão" em y=836) na mesma faixa do botão "Escolher foto da entrega" (y=797). O workbench agora termina com `pb-24`: o último controle da lista não divide a faixa com os selos. Em 390 a mesma reserva afasta o conteúdo da barra inferior do navegador.

Recapturado: `capturas/depois-workbench-real/app_expedicao_b406f296-cdcc-4ccc-82ed-68836f92de2a_{light,dark}_{1440,390}.png`.

## 2. Painel em carga em rascunho

Carga 010 (`dd3e6cbf-…`, `montando`) com o painel de pedidos disponíveis visível em **4 combinações** — `carga-rascunho_{light,dark}_{1440,390}.png`: busca, filtro de status, "Selecionar resultados filtrados", contador e a lista com número/cliente/endereço/status/valor.

Estado de fila vazia + pedido já em outra rota foi provado com resposta controlada da API (sem tocar no banco): `carga-rascunho-vazio-ocupado_light_{1440,390}.png` — "Nenhum pedido aguardando embarque" e "Já em outra rota / PED-9999" desabilitado aparecem juntos. Antes da correção, o bloco vazio sobrescrevia a lista de ocupados; agora os dois estados coexistem.

Medição: contraste 0, overflow 0, console 0 nas 4 combinações. Servidor e Chromium mortos ao fim.
