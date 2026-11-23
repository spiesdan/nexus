---
impacto: nada_mudou
secao: corrigido
titulo: Lista do Inbox não filtra mais 2 mil conversas uma a uma
---

A policy de SELECT de `conversations` chamava duas funções com colunas da linha
por candidata. Em produção, com 2.162 conversas, o banco removia 2.138 uma a uma
do filtro: **929 ms** de RLS contra 3,8 ms sem ela. A policy agora expressa o
MESMO escopo (membro ativo, papel amplo, `visibility_mode`, canais permitidos)
com subqueries resolvidas uma vez e comparações diretas nas colunas — o plano
local passou de `Seq Scan`/26,5 ms para `Index Scan`/11,8 ms, com 897 → 707 buffers.
Nenhum índice novo; as telas e a RLS continuam iguais.
