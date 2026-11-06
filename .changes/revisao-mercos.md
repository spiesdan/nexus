---
impacto: capacidade_nova
secao: adicionado
titulo: Pedido alterado no Mercos agora chega na sincronização e avisa a expedição
---

Até aqui a importação do Mercos só andava para frente: quando o vendedor externo alterava um pedido já importado, a alteração ficava só no ERP. O pedido daqui continuava com o cliente, a cidade e os itens antigos — e a carga saía com o dado velho.

Agora a sincronização revisa uma janela recente de pedidos ainda em aberto e aplica o que mudou. A ficha do pedido também ganhou **Atualizar do Mercos** em "Mais opções", para o caso pontual e para o pedido antigo que o corte por número não revisita.

O que o Mercos pode atualizar: **cliente, endereço de entrega (cidade/UF) e itens/totais**. Status do ciclo, vendedor, carga e ajuste fiscal continuam do nosso lado. Pedido com **nota emitida** não tem itens reescritos — o documento congela. Pedido **entregue ou cancelado** também não.

Quando o pedido já está numa carga, a atualização acontece e a opção **Mudou no Mercos** aparece na parada, com o motivo: nada sai do romaneio sozinho — quem opera decide se remaneja. A ficha mostra a última alteração, campo por campo ("Cliente X → Y", "Quantidade 3 → 4").
