---
impacto: nada_mudou
secao: corrigido
titulo: Legenda da Evolução de Vendas funciona na Home — mês/ano passado chegam aos dados
---

A Home pedia só o mês corrente, então "Mês passado" e "Ano passado" da legenda
ficavam permanentemente desabilitados ali, enquanto os Indicadores funcionavam.
A página e o endpoint de troca de mês agora buscam a mesma janela de 14 meses
dos Indicadores, e as séries de comparação saem das linhas da própria janela —
sem query nova — com o mesmo acumulado (`acumuladoDiario`) nas três telas. O
painel direito do gráfico ganhou a alavanca "Comparar" na Home, e clicar num
item de comparação com ela desligada acende a comparação, pela regra que o
próprio gráfico já aplicava. Nenhum número do mês corrente mudou.
