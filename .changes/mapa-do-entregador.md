---
impacto: nada_mudou
secao: corrigido
titulo: Mapa do entregador em tela cheia, e a rota se organiza por ruas ou distância no celular
---

A tela do entregador abria com o mapa **invisível**: uma faixa cinza no lugar do
mapa, com os pinos desenhados fora da vista. A caixa do mapa nascia com
**0 pixel de altura** — o invólucro em volta não tinha altura própria, e o mapa
herdava "100% de nada". O navegador do celular baixava três pedaços do mapa,
desistia do resto e não mostrava nada.

No computador o mesmo mapa sempre funcionou, porque ali a altura é fixa; por
isso o defeito só apareceu no celular do entregador.

Junto com o conserto, a cabine passou a se comportar como app de mapa:

- **o mapa ocupa a tela inteira**, atrás da folha da entrega — e a folha
  fechada virou um cartão de destino com as duas ações do momento (navegar e
  entregar), em vez do cartão completo que comia metade da tela;
- **o ponto azul "você está aqui"** aparece sozinho ao abrir (a posição só é
  usada no aparelho — enviar posição para o servidor continua sendo o botão
  "Ligar rastreio");
- **botão de recentralizar**: aceso, o mapa acompanha o GPS; arrastar o mapa
  desliga o acompanhamento, para conferir um trecho da rota;
- a rota ganhou **contorno branco** (linha fina colorida sumia no mapa claro);
- os botões de +/− saíram no celular: o zoom é o gesto de pinça.

No **Roteiro**, o entregador agora reorganiza as paradas sozinho, do celular,
igual ao planejador da web: **por distância** (a partir de onde ele está) ou
**por ruas** (caminho mais curto). O cálculo mostra paradas, distância e tempo
antes de valer — a ordem só muda depois da confirmação dele.

Quem já instalou: **não precisa fazer nada**.
