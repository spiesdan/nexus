---
impacto: nada_mudou
secao: corrigido
titulo: "A busca do catálogo achava só os 500 primeiros — o resto não existia para a tela"
---

**"Saco de lixo" mora nas posições 904–958 de 1141, e a busca respondia vazio.**
A tela de produtos entregava os 500 primeiros e filtrava no navegador. Tudo
além do 500º não era filtrável: a busca dizia que não existia produto que
existe. É o mesmo "afirmar ausência sobre amostra" que já apareceu no agente —
agora na tela, onde o dono vê.

A busca filtra no **servidor**, com o mesmo predicado da rota `GET
/api/v1/products` — nome, código ou marca como substring. A página pede a
fatia ao banco (`range` + `count`) e entrega 50 por vez, com o número da
página na URL. Nova busca recomeça da página 1; trocar de página preserva o
termo já confirmado, não o que está meio digitado.

**Sem `count` não há total, e a tela não chuta.** Quando o `Content-Range` não
vem, a paginação mostra "Página N" sem "de Y". Página além do fim (digitada à
mão) volta para a última em vez de mostrar lista vazia sem saída.

A vírgula separa termos no `or()` do PostgREST e a barra invertida é escape
do LIKE. Qualquer uma das duas na busca quebra o filtro ou vira erro. As
duas viram espaço antes de interpolar — o resto passa como substring, igual à
rota da API.

**Mutações provadas:** `range` com off-by-one (51 itens por página) reprova o
teste da faixa; sanitizador removido reprova o teste da vírgula.