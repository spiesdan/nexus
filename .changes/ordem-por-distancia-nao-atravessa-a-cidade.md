---
impacto: nada_mudou
secao: corrigido
titulo: Ordenar por distância para de mandar o motorista para o outro lado da cidade
---
O botão "Ordenar por distância" ordenava as paradas pela distância até a base — do mais perto ao mais longe. Parece razoável no papel e é errado na rua: duas paradas a 2 km da base em direções opostas ficam vizinhas na lista e a 3 km uma da outra no mapa.

Medido na carga 039 (12/11/2026), com as coordenadas já corrigidas: a parada 4 (PRIME AUTOMOTIVE, Centro) mandava para a 5 (BRTECH, Industrial 1) — 3,0 km atravessando a cidade no meio do trajeto. O radial somava 11,65 km entre paradas.

Agora a ordem é o caminho curto de verdade: base primeiro, depois sempre a parada mais próxima da anterior, com uma passada de 2-opt desfazendo os cruzamentos. Nessa mesma carga: BRTECH → LANCHONETE → VITINS → CAMILA → PRIME → SCHIESSL → PAPE, nenhum trecho acima de 1,6 km e 7,25 km no total — o ótimo exato entre as 5.040 ordens possíveis dos 7 pontos. A base continua fixa na primeira posição.

A conta é feita em linha reta e sem depender de serviço externo; a rua continua sendo desenhada pelo OSRM depois, na ordem nova. "Otimizar por ruas" segue existindo para quem quer o caixeiro-viajante pelas ruas de verdade.
