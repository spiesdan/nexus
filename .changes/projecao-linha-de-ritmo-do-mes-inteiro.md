---
impacto: nada_mudou
secao: alterado
titulo: Previsão de vendas vira linha de ritmo do mês inteiro — atravessa o último dia e meses fechados
---

A linha de projeção do gráfico "Evolução de Vendas" deixou de existir só nos
dias futuros e passou a ser o RITMO médio do mês: a taxa diária
(vendido ÷ dias decorridos) projetada do dia 1 ao último. Por construção ela
passa exatamente pelo acumulado realizado de hoje e termina na própria
previsão do mês — no último dia do mês corrente a linha continua lá, e em
meses fechados vira a régua do ritmo médio até o total final.

Mês que ainda não começou continua sem projeção: a legenda "Previsão de
vendas" fica desabilitada e explica "Sem previsão para este mês" no hover, e
o KPI "Projeção" cai para a previsão em vez de mostrar R$ 0.

Também conserta um efeito colateral em meses fechados: a linha realizada era
truncada no dia de número igual a "hoje" (um agosto de 31 dias visto em 30 de
setembro perdia o dia 31 do desenho) e o tooltip escondia "No dia" dos últimos
dias. A trava de mês corrente agora vale para isso também; o tooltip passou a
mostrar "Projeção do dia" também nos dias passados, junto do realizado.

Validação: typecheck e lint zerados, gov:verify na régua da 1.16.7 (15
falhas pré-existentes, 0 novas), 19 testes do gráfico e 6 novos da grade em
lib/comercial/visao-do-mes.test.ts.
