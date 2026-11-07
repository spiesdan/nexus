---
impacto: nada_mudou
secao: corrigido
titulo: O pedido agora é encontrado pelo número na busca
---

Digitar o número do pedido no campo de busca da lista devolvia lista vazia — como se o pedido não existisse. A busca só olhava nome e documento do cliente, e o número é justamente o que a pessoa tem na mão: o telefone, o romaneio, o boleto.

Agora o campo aceita o número nas duas formas que aparecem na rotina — `19405` e `PED-19405` — e continua achando por nome e por CNPJ/CPF. A mesma régua vale na busca global (⌘K) e no assistente, que usam a mesma rota.

De passagem, um cliente com vírgula ou parêntese no nome ("SILVA, MARIA") deixou de derrubar a consulta: esses caracteres são sintaxe do filtro e agora não vazam para dentro dele.
