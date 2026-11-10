---
impacto: nada_mudou
secao: corrigido
titulo: O cadastro do Mercos é o cadastro do CRM — um pra um
---

O cadastro do Mercos deixou de nascer duplicado no CRM. Antes, a ficha nova do
cliente do ERP era criada com a segunda tag `mercos:pedido-sem-cadastro` — o
stub que marcava "ficha só pra o pedido não ficar órfão" — e o importador em
lote ainda não deduplicava dentro do próprio lote, então duas extrações do
mesmo cliente (variações de espaço e caixa no nome) viraram duas fichas.

Agora a importação casa o contato por documento (CNPJ, CPF, nome normalizado
ou telefone) e só cria ficha quando o cliente realmente não existe; quem já tem
ficha é completado, sem sobrescrever dado do operador. A tag única `mercos` cobre
toda a superfície.

E os duplicados históricos já no banco são recolhidos pela fusão
`fn_mercos_fundir_duplicados`: mesmo nome normalizado + mesma cidade fundem, o
perdedor vira ponteiro (`is_merged_into`), nada é apagado, e pedidos, conversas,
leads e filas são remarcados. Mesmo nome com documento divergente (CNPJ ou CPF
diferente) mantém os dois clientes — é o caso do dono: "tem cadastro com o mesmo
nome com CNPJ diferente, ai deixe os 2".
