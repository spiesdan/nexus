---
impacto: capacidade_nova
secao: adicionado
titulo: Venda avulsa na NF-e ganha seleção de produto do catálogo
---

Na NF-e de venda avulsa (balcão) o operador conta a venda; quando o produto já existe no catálogo, o seletor (`ProdutoParaItem`) escolhe o produto e o item nasce com descrição + NCM + unidade do cadastro, com o vínculo `product_id`/`codigo` que o resolver do drain usa para casar o fato à classificação fiscal. O preço da venda continua com o operador — o catálogo traz custo, a venda avulsa traz o valor que o cliente pagou.

Com isto, "digita o nome e seleciona" sai da digitação livre: o balcão passa a nascer do catálogo cadastrado, sem NCM manual.
