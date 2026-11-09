---
impacto: nada_mudou
secao: corrigido
titulo: O PDF do pedido não trazia o vendedor quando o pedido vem do Mercos
---

O PDF do pedido (e do lote) saía com o campo "Vendedor" em branco — o traço
(--). A montagem do PDF só olhava o vínculo com usuário (`vendedor_user_id`);
pedidos de origem Mercos gravam o vendedor no próprio pedido ("VENDEDOR JB"),
sem casar com usuário.

Agora o nome que o próprio pedido já registrou é o fallback: o vendedor aparece
no PDF pelo que o pedido carregou, e quem foi resolvido por usuário continua
pelo cadastro. Nenhum fluxo de digitação mudou — só o impresso volta a nomear a
representada.
