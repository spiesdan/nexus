---
impacto: nada_mudou
secao: corrigido
titulo: Geocodificação rejeita coordenadas fora da faixa válida
---

O resolvedor de coordenadas aceitava qualquer número finito como latitude ou
longitude — um valor com centésimos fora do planeta entrava na rota e o mapa
desenhamia linha para lugar nenhum.

Agora a faixa é validada (latitude entre -90 e 90, longitude entre -180 e
180) antes de virar parada; resultado fora de faixa é rejeitado como erro e a
cadeia de fallback segue para o próximo candidato.
