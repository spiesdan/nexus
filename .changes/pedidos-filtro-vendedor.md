---
impacto: nada_mudou
secao: corrigido
titulo: O filtro de Vendedor lista os vendedores da organização
---

A tela de pedidos tinha o filtro de vendedor sem quem selecionar — só "Todos os
vendedores" e "Só meus pedidos", com a lista de vendedores nunca chegando ao
select.

A lista passa a nascer no server component (mesma fonte da tela de Comissões:
membros da organização com role != viewer, nomes resolvidos via service role) e
é repassada ao filtro no primeiro paint. Vendedores que registraram pedidos no
Mercos passam a aparecer com o nome resolvido, e o filtro volta a recortar por
vendedor — a base do lançamento com campanha no Meta a 1 msg/min.
