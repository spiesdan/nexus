---
impacto: nada_mudou
secao: corrigido
titulo: Cidade sem UF no cadastro não vira uma segunda linha na campanha
---

A lista de cidades da campanha por região contava a mesma cidade mais de uma vez quando o cadastro importado veio sem UF e com o nome do estado colado. Em Canoinhas, a tela mostrava quatro linhas: `Canoinhas, Santa Catarina/SC` (206), `CANOINHAS` sem UF (3), `canoinhas/PR` (1) e `canoinhas, Santa Catarina` sem UF (1).

Agora o nome do estado colado sai do rótulo mesmo quando a UF não veio, e a linha sem UF entra na linha da cidade quando existe **um** estado conhecido para ela. Cidade com o mesmo nome em dois estados (`Bom Sucesso/PR` e `Bom Sucesso/PB`) continua separada, porque a campanha compara UF quando o operador escolhe o estado.

O efeito na tela é a cidade voltar a aparecer uma vez só, com o nome limpo e a soma dos clientes.
