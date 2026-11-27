---
impacto: capacidade_nova
secao: adicionado
titulo: Radar de prospecção mostra os estados da busca, a origem da chave e repete por coordenada
---

A aba Pesquisas do Radar passa a acompanhar a busca do mapa pelo que o contrato
devolve: cada cartão mostra **um** bloco explicativo, na ordem parando →
degradada → parcial → zero, com o progresso por termo (nunca por célula),
"Pausar" só enquanto a busca corre e o parcial preservado quando ela para.

As saídas do zero e da degradada viram ação: ampliar o raio, buscar no OSM ou no
Google Places. O Places só aparece desabilitado quando falta a flag ou a chave —
com o motivo visível — e, quando disponível, a tela diz se a chave é **da
organização** ou **da instalação**. Repetir uma busca usa a latitude/longitude da
listagem, então a área coberta é a mesma. O Maps sai do seletor de provedor até
12/12, porque a rota ainda o recusa.
