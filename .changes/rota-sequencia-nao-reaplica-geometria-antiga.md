---
impacto: nada_mudou
secao: corrigido
titulo: Sequência manual na rota invalida a geometria que estava desenhada
---

Ao alterar a ordem de entrega manualmente na tela de rota, a linha que o
mapa desenhava pertencia à sequência anterior e podia continuar no caminho
errado.

Com a sequência gravada, o backend invalida a geometria (`rota_geojson`),
a distância e a duração — e incrementa a versão da rota. Sem isso, a tela
mostrava a linha da ordem antiga enquanto a lista de paradas já estava na
ordem nova, e o motorista ia de fato para o trajeto errado.

Quando a alteração vem de uma proposta salva (otimizar e salvar), a
geometria passa a vir do próprio payload, então a invalidação não se aplica.
