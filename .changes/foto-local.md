---
impacto: nada_mudou
secao: corrigido
titulo: As fotos enviadas aparecem na lista de produtos
---

Depois de passarem a vir junto com a lista, as imagens ainda não apareciam: as
fotos enviadas pelo próprio sistema ficam guardadas em disco no servidor, e a
lista tentava buscá-las no serviço de arquivos, que não as conhece.

Agora as fotos guardadas em disco são servidas pelo caminho certo, e aparecem
na lista. A regra que decide qual caminho usar ficou em um único lugar, em vez
de repetida em três arquivos — que era como as versões divergiam sem ninguém
perceber.
