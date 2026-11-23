# 64 — P1-27: o Dashboard diz quando não há série

**Data:** 23/11/2026 · **Base:** `nexus/main@82c90c181` · **Rota:** `/app?mes=2020-01` (mês sem vendas no banco local).

## O defeito

Com um mês sem vendas, o Dashboard desenhava o gráfico zerado — eixo, linha plana,
legenda “Vendas no mês”, meta e projeção a R$ 0 — sem dizer que aquilo era
ausência de dado. A tela parecia um gráfico “carregado” que só dizia zero.

## O que mudou

`NexusEmptyState` aparece **acima** do gráfico quando a série não tem o que
desenhar: todos os acumulados de venda em zero **e** sem meta nem projeção.
A fonte está no texto (“as vendas entram”, “o que foi registrado”) — nenhum
cartão novo com número inventado.

O gráfico **continua na tela** de propósito: as setas de troca de mês moram nele,
e escondê-lo deixaria quem navegou para um mês vazio sem caminho de volta.

`serieDiariaDoMes` devolve um ponto por dia (com valor zero quando não há
venda), então `serie.length === 0` nunca acontecia — a condição certa é o
acumulado zero, não o tamanho do array.

## Prova (mesma base, 4 combinações)

| Régua | Antes | Depois |
| --- | --- | --- |
| Frase “Ainda não há vendas neste mês.” | 0/4 | **1/4 em cada combinação** |
| Textos na página (1440) | 196 | 198 |
| Contraste AA reprovado | 0 | 0 |
| Overflow horizontal | 0 px | 0 px |
| Console/pageerror | 0 | 0 |

Capturas `capturas/{antes,depois}-dashboard-vazio/` (claro/escuro × 1440/390);
medição `capturas/medicao-dashboard-vazio/varredura.json` (4/4 válidas).
Servidor e Chromium mortos ao fim.
