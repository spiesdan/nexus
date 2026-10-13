---
impacto: nada_mudou
secao: corrigido
titulo: Mapa não cobre mais o modal, e a tela de Empresas ganha categoria, estado e data
---

**O mapa cobria a UI que abria sobre ele.** O Leaflet escreve z-index nos
próprios panes — 400 na overlay, 600 nos marcadores, 800 no popup, 1000 no
controle — e esses valores são em pixels, na MESMA pilha da página. O `Dialog`
e o `Sheet` deste repo usam `z-50` (50), que é MENOR que qualquer pane: abrir a
ficha de uma empresa deixava o mapa inteiro por cima do modal, e o popup por
cima de tudo. O `isolate` na caixa do mapa cria um stacking context próprio — os
z-index do Leaflet passam a valer só dentro dele.

**Filtros que a tela não tinha, com o dado já gravado:**

- **Categoria** — seletor com as categorias REAIS e a contagem de cada uma,
  vindas de `GET /prospects/categorias`. Não são as 83 subcategorias do Radar:
  aquelas são termos de busca em português, e o campo gravado é o rótulo da
  API do Google ("Auto repair shop", "Building materials store"). Um seletor
  com as 83 devolveria vazio para quase tudo.
- **Busca por categoria passou a ser parcial** (`ilike` em vez de `eq`):
  assim "mecanica" traz "Auto repair shop" em vez de exigir a string exata.
- **Estado** — campo de 2 letras, com o valor em maiúsculas.
- **Prospectada há** — corta por `discovered_at`: hoje, 7, 30 ou 90 dias.

Os três viram chip removível, e o contador de filtros ativos passou a contá-los
— sem isso, um filtro aplicado ficava invisível depois de fechar "Filtros
avançados".