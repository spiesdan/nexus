---
impacto: nada_mudou
secao: corrigido
titulo: O aviso "Mudou no Mercos" para de disparar em pedido que não mudou
---
A revisão do Mercos compara o que o ERP manda com o que está no CRM e avisa a expedição quando algo mudou depois do embarque. Em 12/11/2026 o aviso aparecia em 17 das 19 paradas da carga 40 — e nenhuma delas tinha item, quantidade ou preço alterado.

O que todas registravam era a mesma mudança falsa: a cidade de "GENERAL CARNEIRO, Paraná/PR" para "GENERAL CARNEIRO, Paraná". A cidade é idêntica dos dois lados. O que "mudava" era a UF: o cadastro tem `PR` e o Mercos nunca manda `uf` — o coletor extrai a linha "<cidade>, <estado>" da tela e manda tudo dentro de `cidade`, com o estado por extenso.

Agora uma régua só separa cidade e UF, usada pela importação e pela revisão, aceitando sigla ou nome do estado ("Bituruna, Paraná", "Canoinhas, SC", "Canoinhas/SC"). O aviso só olha UF quando o ERP realmente mandou UF. De quebra, a revisão limpa o cadastro que a importação antiga sujou com o nome do estado colado — "Bituruna, Paraná" vira "Bituruna" com `uf = PR`, sem marcar a carga.

A regra do aviso continua a mesma: mudou cliente, endereço ou itens/totais depois de entrar na carga, a parada avisa e quem opera decide se remaneja.
