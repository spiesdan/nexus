---
impacto: nada_mudou
secao: corrigido
titulo: A área do gráfico de vendas para no último dia realizado
---

A linha da área era desenhada até a borda direita do gráfico, enquanto os pontos
e o fechamento paravam no último dia com dado realizado. O resultado eram dois
defeitos visíveis no mesmo gráfico: a linha passava por cima do futuro e uma
área triangular aparecia sob os dias que ainda não aconteceram.

O passo horizontal passa a vir do mês inteiro (o eixo), não do tamanho da série
truncada. Assim a área, os círculos e a linha terminam no mesmo dia — o último
com venda realizada.
