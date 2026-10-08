---
impacto: nada_mudou
secao: corrigido
titulo: Aba Radar deixa de dar erro ao listar clientes inativos
---

A aba Radar mostrava um erro ao abrir a lista de clientes que pararam de
comprar, mesmo com o sistema funcionando normalmente.

O motivo era o tamanho da pergunta: a lista de clientes ia inteira em um único
pedido ao banco de dados. Quando passava de certo tamanho, o banco recusava por
limite de tamanho e a tela recebia um erro genérico, sem dizer o que era.

A lista agora é dividida em partes menores, e cada parte é buscada por conta
própria.