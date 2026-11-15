---
impacto: capacidade_nova
secao: adicionado
titulo: Endereço sem número agora tem entrada marcada, com aviso e memória
---

Um terço dos endereços de entrega não tem número de casa. Medido na base em
15/11/2026: dos 49 destinos, 31 tinham número, 12 estavam como `S/N` e 6 com o
campo vazio. Para esses, o mapa não tem como achar a porta — nenhum
geocodificador devolve o que não existe — e o pino caía no meio da rua, no
centro do bairro ou no centro da cidade. Era o mesmo erro que produzia os
1.872 m de Canoinhas.

O que ficou pior era o botão. A tela oferecia **"Tentar de novo"** em cima de um
endereço sem número, e o resultado era sempre o mesmo, porque não havia número
para o mapa achar. Quem operava concluía que o mapa estava errado.

Agora:

- **O aviso é honesto.** A lista e o mapa dizem `sem número no cadastro`, e para
  esses endereços o "Tentar de novo" desaparece — não faz sentido oferecer o que
  não pode funcionar. Endereço *com* número que só chegou até a rua continua
  tendo o botão.
- **A entrada é um dado, não um pino solto.** "Marcar no mapa" virou "marcar a
  entrada", com quem marcou, quando e uma **referência** livre para o motorista:
  "portão azul", "entrada pelos fundos". É isso que atravessa a última centena
  de metros.
- **A marcação vale para as próximas cargas.** A memória é do endereço, não do
  cliente: marcar uma vez resolve para sempre, inclusive para outro cliente no
  mesmo prédio. Antes, o mesmo endereço era marcado de novo toda semana.
- **Quem entrega confirma.** O motorista vê a referência, chega e toca em "é
  aqui". A entrada passa a ter procedência de quem esteve na porta — a marcação
  do escritório é estimativa, a do motorista é prova.
- **Antes de despachar, o resumo diz quantas faltam:** "3 paradas sem entrada
  marcada — o pino é aproximado". É a última chance de resolver com o caminhão
  ainda na base.
- **O painel de recuperação parou de mentir.** Ele acusava bloqueio da
  otimização para endereço que já tinha pino — inclusive os que nascem com a
  entrada memorizada. Agora usa a mesma régua do servidor: só bloqueia o
  endereço que nunca foi resolvido **e** não tem pino.

Nada muda para quem tem número no cadastro e o mapa acha a casa: o pino continua
saindo do nó do OpenStreetMap, e a entrada nunca sobrescreve um pino preciso —
só ocupa o lugar de um pino que não é a porta.
