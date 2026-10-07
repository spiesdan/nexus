---
impacto: nada_mudou
secao: corrigido
titulo: Fotos da lista de produtos não quebram mais a página no navegador
---

A tela de catálogo buscava as fotos de cada produto em uma requisição
separada. Com centenas de produtos, a rajada derrubava o serviço de
autenticação e o navegador recebia 401 mesmo com a sessão válida. Agora a
lista inteira vem em uma única chamada, e os identificadores vão no corpo da
requisição — mandá-los na URL passava de 18 KB e quebrava a conexão HTTP/2,
levando junto as outras chamadas da tela.