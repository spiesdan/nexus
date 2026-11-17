---
impacto: nada_mudou
secao: corrigido
titulo: O mês da comissão é o mês do seu fuso, e baixa parcial aparece como parcial
---
A comissão do mês era calculada com as bordas em UTC. No horário de Brasília
isso significava que o pedido feito entre 21h e 23h59 do último dia do mês caía
na comissão do mês seguinte — e o da véspera entrava no mês anterior. O
fechamento do vendedor errava um dia inteiro de pedidos, todo mês.

Agora o período é calculado no fuso da organização. Junto:

- Uma **baixa parcial** de comissão aparece como parcial, com o valor pago. Antes
  o selo dizia "baixada" e o total somava a comissão inteira.
- O fim do período das vendas é inclusivo, então "recebido" e "vendas" no painel
  comparam exatamente a mesma janela.
- Os cartões de recebido e vendas seguem o filtro de data da tela; antes o
  "recebido (período)" era o total histórico ao lado de um filtro visível.
- Dar baixa em comissão pede confirmação com valor e pedido.
