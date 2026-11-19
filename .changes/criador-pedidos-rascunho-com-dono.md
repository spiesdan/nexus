---
impacto: nada_mudou
secao: corrigido
titulo: Rascunho do pedido é da pessoa na organização, não do navegador
---

O autosave do criador de pedidos morava numa chave única do `localStorage`
(`pedido-rascunho`) — a mesma para todos os usuários e organizações do navegador. Num
balcão compartilhado, que é como loja pequena usa o sistema, a vendedora B abria
`/app/pedidos/novo` e encontrava cliente, itens e preço do rascunho da vendedora A;
trocando de organização no mesmo navegador, o vazamento era entre tenants. A chave passou
a carregar organização e usuário.

O rascunho salvo por versões anteriores (na chave sem dono) **não** é retomado: restaurar
um rascunho de dono desconhecido é exatamente o vazamento que a correção fecha. Nada a
fazer na VPS; a venda em andamento é redigitada uma vez.
