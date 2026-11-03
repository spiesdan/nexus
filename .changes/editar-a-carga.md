---
impacto: capacidade_nova
secao: adicionado
titulo: Dá para editar a carga em montagem — mais um pedido na doca e trocar o veículo
---

A carga nascia com os pedidos escolhidos na montagem e não mudava mais: pedido
que chegava depois do romaneio impresso só entrava excluindo a carga inteira e
montando outra, e **trocar a placa ou o motorista exigia recriar a carga**.

Na ficha da carga, enquanto ela está em **montagem**:

- **Adicionar pedido** abre a fila de embarque já sem os pedidos que estão em
  outra carga — busca por número, cliente ou cidade, e seleção de vários de uma
  vez, porque a doca costuma pôr mais de um. O pedido entra no fim da sequência
  e o cliente dele recebe o mesmo aviso de embarque dos outros.
- **Veículo** corrige placa, veículo e motorista. Vale para o cabeçalho, o
  romaneio e o modo motorista — o motorista não vê mais a placa antiga. Esta
  correção continua disponível **em rota**: placa digitada errada ou motorista
  trocado no último minuto não podem exigir recriar a viagem.

Já **a lista de paradas** só aceita pedido novo em montagem: depois que a carga
sai, a sequência é a que a rota já leu e o motorista já recebeu. Pedido que está
em outra carga também não entra — a tela avisa em vez de duplicar a parada.
