---
impacto: nada_mudou
secao: corrigido
titulo: Cargas de teste do QA só usam endereço com um único nó no mapa
---

As três cargas de teste da Expedição usavam endereços que existem no
OpenStreetMap como nó de casa — mas alguns deles existem **duas vezes**: Mafra
tem dois nós nº 484 na Rua Marechal Deodoro (700 m entre eles), Paula Freitas
dois nós nº 80 na Rua Gustavo Schuartz e União da Vitória dois nós nº 490 na
Avenida Interventor Manoel Ribas. O geocodificador acerta um dos dois, e o pino
aparece a 79 m, 290 m e 1.043 m do outro. Não é defeito de código: o dado do
mapa é que é ambíguo.

Agora as cargas usam só ruas com **um** nó por número — todas as nove paradas
saem com o pino a 0,0 m do nó do mapa, o que torna a comparação com o Google
Maps uma medida de verdade. As três paradas ambíguas saíram (e um teste impede
que voltem).
