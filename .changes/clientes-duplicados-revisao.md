---
impacto: nada_mudou
secao: adicionado
titulo: Tela de revisão de clientes duplicados, com fusão confirmada
---

Cliente duplicado por nome e cidade não pode ser fundido pelo sistema — duas pessoas com o mesmo nome na mesma cidade não são a mesma pessoa —, mas também não havia onde um humano decidir: 117 grupos e 2.075 fichas ficavam num limbo. A tela `/app/clientes/duplicados` mostra as fichas lado a lado (telefone, e-mail, endereço, nº de pedidos, última compra), deixa escolher o vencedor e diz, antes do clique, quantos pedidos e conversas vão passar. A RPC `fn_fundir_contatos` descobre no catálogo todas as tabelas com `contact_id` e reponta numa transação; "não é a mesma pessoa" fica registrado e o grupo não volta. Fundir exige manager.
