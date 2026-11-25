---
impacto: nada_mudou
secao: corrigido
titulo: Busca de contato acha pelo nome fantasia (SENAI, não só a razão social)
---

Quem procurava "SENAI" na nota avulsa recebia as cinco fichas de importação repetida — que têm "SENAI" no `name` — e **não** recebia a ficha com CNPJ, endereço e e-mail, porque o nome dela é a razão social "SERVICO NACIONAL DE APRENDIZAGEM INDUSTRIAL" e o fantasia não estava no OR da busca. O operador concluiu "não tem cadastro" e parou a emissão. `fantasia` entrou na busca de contatos; é o nome que a operação usa para PJ.
