---
impacto: nada_mudou
secao: corrigido
titulo: "KPI Projeção não mostra mais R$ 0 em mês fechado e a legenda desligada explica o motivo"
---

No último dia do mês e em qualquer mês fechado a série de projeção vem vazia —
não sobra amanhã para projetar — e o card **Projeção** interpretava isso como
zero: o dono via **R$ 0,00** do lado da Previsão com o valor certo. O card
agora cai para a previsão do mês, que é exatamente a projeção quando ela
existe, e nunca mais exibe zero por falta de dado. A legenda de previsão de
vendas, quando não há o que ligar, passa a dizer o motivo no hover ("Sem dias
futuros no mês para projetar") em vez de ficar muda; com dias futuros no mês
corrente ela acende e some como sempre.
