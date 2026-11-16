---
impacto: nada_mudou
secao: corrigido
titulo: NF-e deixa de ser rejeitada por IE da entrega, pagamento e devolução
---

Quatro rejeições da SEFAZ apareceram na emissão e cada uma tinha uma causa
diferente no XML. O grupo `<entrega>` era emitido sempre, repetindo o endereço
do destinatário: a SEFAZ cobrava a IE daquele local (176) e, para cliente sem
IE cadastrada, não havia o que informar — o grupo não é mais emitido. A
descrição do pagamento ia junto com formas que não a aceitam (442). E a
devolução de venda saía como compra para comercialização, sem referenciar a
nota original e com valor de pagamento (327 e 904); agora sai como entrada,
com o CFOP derivado da venda, referenciando a chave original e sem pagamento.

Cliente contribuinte precisa da IE no cadastro: sem ela a SEFAZ recusa a nota
(232), e a tela de correção da nota é onde ela se preenche.
