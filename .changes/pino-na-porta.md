---
impacto: nada_mudou
secao: corrigido
titulo: O pino da parada cai na porta, não no centro do bairro
---

Quando o endereço tinha número, a geocodificação só aceitava o pino se o mapa
conhecesse o imóvel. Onde o imóvel não está mapeado — a maior parte do interior
— ela desistia da rua e caía no centro do bairro: medido em endereços reais da
operação, 1,87 km de erro em Canoinhas, 694 m em Major Vieira, 384 m em
Irineópolis. O pino aparecia longe de onde a entrega é, e não havia como
corrigir na tela.

Agora a consulta vai em duas frentes. Primeiro a **consulta estruturada**
(`street=<número> <rua>`, cidade e UF em campos separados), que é a única que
acha o número da casa no Nominatim: em Paula Freitas (nº 80) e Caçador
(nº 957) o texto livre devolvia a cidade e o bairro, e a consulta estruturada
devolve a casa. Depois, se o imóvel realmente não existe no mapa, o pino fica
na **rua certa** — nunca mais no centro do bairro — e a tela continua dizendo
que é aproximado. Pino de rua só vale quando a rua devolvida é a rua pedida:
a BR-476 não volta a ser a "Rodovia do Xisto", 12,7 km fora.

Todo pino aproximado (rua, bairro ou cidade) agora tem **Tentar de novo** e
**Marcar no mapa** na lista de paradas. Antes só o pino de cidade podia ser
corrigido à mão — justamente os dois tipos mais comuns no interior ficavam
presos no lugar errado.
