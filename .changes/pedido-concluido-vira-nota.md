---
impacto: nada_mudou
secao: corrigido
titulo: Pedido concluído no Mercos volta a virar nota, e a ficha mostra os itens que o banco tem
---
Dois defeitos que apareciam juntos quando o Mercos reescrevia um pedido já importado.

O primeiro é de status. A migration 0302 separou "venda fechada no ERP, sem nota" (`concluido`) de "nota já emitida no ERP" (`faturado`) — e a lista de status que podem virar NF-e ficou só com os antigos (`faturado`, `expedido`, `entregue`). O Mercos não escreve `faturado` em venda fechada; ele escreve `concluido`. Resultado: o pedido que o próprio aviso mandava faturar era recusado com "só pedido faturado, expedido ou entregue vira nota", e a saída era avançar o status à mão — dizendo que já existia nota para liberar a emissão. Agora `concluido` é faturável na emissão, na pré-validação, na lista de pedidos da aba Emitir nota e no assistente.

O segundo é o que fazia o operador desconfiar da nota: a tabela de produtos da ficha continuava mostrando a lista antiga depois do "Atualizar do Mercos". O `recarregar()` trazia o pedido novo (total, aviso) e descartava os itens que vinham na mesma resposta, porque eles eram só prop do Server Component — só mudavam com um `router.refresh()`. A ficha agora guarda os itens em estado, aplica o que a rota devolve e continua adotando o servidor quando ele muda de verdade. A NF-e sempre saiu dos itens do banco; o que estava errado era a tela que a pessoa confere antes de emitir.
