---
impacto: nada_mudou
secao: corrigido
titulo: O filtro de cidade da Expedição acha os pedidos importados
---

Na tela **Expedição**, filtrar por **Canoinhas** devolvia zero pedidos — mesmo
com 32 pedidos de Canoinhas na fila de embarque.

A cidade não é um campo do pedido: ela mora no cadastro do cliente. E 107 dos
109 pedidos aprovados ou faturados desta instalação vieram do emissor sem o
vínculo com o cadastro (`contact_id` vazio), embora trouxessem o CNPJ. Sem
vínculo não havia cidade para comparar, e o filtro — que estava correto —
concluía, corretamente, que nenhum pedido era de lá.

Agora o pedido sem vínculo é ligado ao cadastro **pelo CNPJ**, na hora de
mostrar a tela. O documento do pedido vem com máscara
(`81.521.056/0001-93`) e o cadastro guarda só os dígitos
(`81521056000193`) — é essa diferença, invisível na tela, que fazia o encontro
falhar. Dos 109 pedidos, 101 passam a ter cidade.

O mesmo defeito existia na **busca por texto**, que promete "Buscar por número,
cliente, cidade ou CNPJ" mas só olhava o endereço de entrega: digitar
"canoinhas" ali também não achava nada. A busca passou a olhar a cidade do
cadastro, e cada linha da lista mostra a cidade ao lado do valor, para dar para
conferir de relance por que aquele pedido apareceu.

Nada é gravado: o vínculo é só de leitura, e o pedido continua como está no
banco.
