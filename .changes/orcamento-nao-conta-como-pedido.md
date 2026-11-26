---
impacto: nada_mudou
secao: corrigido
titulo: O total do dia separa venda, orçamento e cancelado
---

O cabeçalho do dia somava todo cartão num número só: "8 pedidos · R$ 10.345,80" incluía três "Em orçamento" (R$ 7.006,00) e um cancelado — quem lê aquele total como venda do dia lê errado. Agora o dia mostra as três parcelas com o próprio nome: "5 pedidos · R$ 3.339,80 · 3 orçamentos · R$ 7.006,00 · 1 cancelado · R$ 1.320,00", e as três fecham com o total do dia. A regra é por status (`rascunho` é o rótulo "Em orçamento"), mora em `lib/pedidos/partir-do-dia.ts` e tem teste que cobra a soma fechando.
