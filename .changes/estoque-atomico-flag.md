---
impacto: nada_mudou
secao: corrigido
titulo: Baixa de estoque atômica existe, mas nasce desligada
---

A função `fn_criar_pedido_com_estoque` passa a existir no banco: a baixa de
estoque pode acontecer **na mesma transação** do pedido, em vez de depois e só
com erro no log.

**Ela entra desligada** (`ORDER_STOCK_ATOMIC=false`): o caminho de criação
continua o mesmo enquanto o dono não ligar, depois de ver o `test:db` em
produção.

**Nada a fazer na VPS** — o comportamento desta versão é o mesmo de antes; a
função fica pronta para ser ligada.
