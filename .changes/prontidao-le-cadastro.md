---
impacto: nada_mudou
secao: corrigido
titulo: Prontidão da carga lê o endereço do cadastro, não só o do pedido
---

A checagem antes de criar a carga olhava apenas `commercial_orders.endereco_entrega` e bloqueava a carga dizendo "3 pedidos sem endereço — corrija antes de incluir", mesmo com o cliente tendo endereço completo no cadastro — e sem lugar na tela para corrigir. O destino que a rota grava sempre veio de `enderecoDaEntrega` (pedido com rua, senão cadastro); era a checagem que consultava o lugar errado. Agora o servidor resolve o endereço efetivo de cada pedido com o mesmo resolvedor e manda o mapa pronto para a tela: a contagem da revisão e o bloqueio usam exatamente o que a entrega vai levar. Endereço resolvido vazio continua bloqueando — ausência de verdade não vira ok.
