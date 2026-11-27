---
impacto: nada_mudou
secao: corrigido
titulo: Prospecção em /app/campanhas volta a carregar a lista de buscas
---

A página pedia cinco colunas que não existem em `prospecting_searches` e a
consulta do servidor falhava com 400; a lista inicial vinha vazia. A seleção
agora usa só as colunas existentes, e a aba Pesquisas preenche pela API como
antes. Nenhuma mudança para quem usa além do erro que deixa de existir.
