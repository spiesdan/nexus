---
impacto: nada_mudou
secao: corrigido
titulo: Lote de fotos dos produtos deixa de devolver erro 500
---

A tela de catálogo pede as fotos de toda a lista em uma única chamada. Com
centenas de produtos, essa chamada ultrapassava o limite de tamanho de URL do
serviço de dados e a tela recebia erro 500. Agora a consulta é feita em partes,
e um teste novo garante que nenhuma delas fique grande demais.