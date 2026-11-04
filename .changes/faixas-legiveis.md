---
impacto: nada_mudou
secao: corrigido
titulo: As faixas de números param de se espremer quando a barra lateral está aberta
---

Com a sidebar aberta, a área útil cai para ~850 px e as quatro colunas das
faixas de situação espremiam o texto: "0 paradas em aber…", "28 pedidos na
doca" cortado, e na ficha da carga os dois valores em reais encostavam um no
outro. O problema não é o tamanho da janela — é a sidebar comer a largura, e
breakpoint de viewport não enxerga isso.

Agora as faixas viram **2×2 abaixo de 1536 px** e só voltam a quatro colunas em
telas largas de verdade. O número não encolhe (`shrink-0`) e o texto ao lado
pode truncar (`min-w-0`), então nada mais se sobrepõe. Junto, a faixa de Notas
ganhou `shrink-0`: ela ficava com **2 px de altura** dentro da coluna flex da
página e não aparecia.
