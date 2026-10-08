---
impacto: nada_mudou
secao: corrigido
titulo: O painel inicial deixa de levar vários segundos para abrir
---

O painel inicial demorava vários segundos para mostrar os números, e em alguns
momentos voltava vazio porque o aplicativo era reiniciado no meio do
carregamento.

A causa era a forma como as datas eram convertidas para o calendário: a cada
linha de pedido o sistema criava um novo conversor, em vez de reaproveitar o
mesmo. Com muitos pedidos isso consumia o espaço de memória do aplicativo e o
servidor era reiniciado enquanto a página ainda carregava.

Os números agora são calculados reaproveitando o conversor, e o painel abre
com os valores.