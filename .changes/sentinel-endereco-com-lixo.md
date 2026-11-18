---
impacto: nada_mudou
secao: corrigido
titulo: Sentinel encontra cadastro com endereço gravado como "NULL", "undefined" ou "NaN"
---

Cadastros antigos podem ter o texto do valor ausente no endereço: `NULL`,
`undefined`, `NaN` ou só espaços em logradouro, complemento, bairro ou cidade.
A busca é por palavra: `RUA NULL` casa; `RUA NULLS` não.
O Sentinel passa a abrir uma ocorrência por organização com a contagem por campo
e os ids dos cadastros afetados — sem colocar o endereço na evidência, porque é
dado pessoal.

É observação, não correção: o escritor que gravava o literal não está mais no
código, e o cadastro precisa do dado real confirmado por uma pessoa. O alerta
serve para o passado não ficar invisível e para o futuro não regredir calado.
Medido após a limpeza dos 84 históricos: **0 cadastros** com o literal.
