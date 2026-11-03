---
impacto: nada_mudou
secao: corrigido
titulo: indFinal segue o cadastro do destinatário — empresa com IE não é consumidora final
---

O `<ide>` saía com **`indFinal` fixo em 1** (consumidor final) para toda venda,
inclusive para empresa contribuinte do ICMS com Inscrição Estadual. O indicador
não é escolha da tela: ele diz se a operação é com consumidor final ou não, e a
informação já está no cadastro do destinatário.

Agora ele segue o **mesmo campo que alimenta o `indIEDest`**: `indicador_ie` 1
(contribuinte com IE) declara `indFinal` 0; isento e não contribuinte continuam
como consumidor final. Nenhum dado novo é pedido — a fonte é a mesma do
`indIEDest`, que já vinha do cadastro desde a correção do destino.