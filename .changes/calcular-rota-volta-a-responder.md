---
impacto: nada_mudou
secao: corrigido
titulo: Calcular a ordem da carga volta a responder — e localiza os endereços no mesmo clique
---

Na tela de expedição, **"Ordenar por distância"** e **"Otimizar por ruas"**
nasciam desabilitados em toda carga nova, com a legenda "Otimizar desativado:
nenhuma parada localizada". Sem coordenada nenhuma, o botão não fazia nada — e
não dizia o que fazer. As três cargas abertas hoje estavam assim: 0 paradas no
mapa, 27 com endereço no cadastro.

Duas causas, as duas corrigidas:

- **O clique não tinha saída.** Agora o cálculo localiza os endereços da carga
  antes de ordenar, mostrando o progresso, e só desiste com o motivo escrito
  ("sem endereço não há ordem — corrija o cadastro ou marque no mapa"). O botão
  nunca fica morto.
- **A parada sem mapa sumia da lista.** A proposta do servidor só traz quem tem
  coordenada; as demais voltam separadas. A tela mostrava só a primeira metade
  e o **"Salvar ordem"** era recusado ("a ordem precisa cobrir todas as paradas
  exatamente uma vez") depois de otimizar. Agora as paradas sem mapa ficam no
  fim da lista, com o aviso de quantas são.

O endereço de cada parada continua vindo do pedido quando ele tem um, senão do
cadastro do cliente — nunca de um ponto inventado.
