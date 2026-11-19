---
impacto: nada_mudou
secao: corrigido
titulo: axe nas telas fora do recorte (0 violações) e as listas dizem em que ordem estão
---

As telas de estoque, compras, expedição, faturamento e sentinel passaram a ser medidas pelo axe
em WCAG 2.2 AA — 0 violações, com número de nós e de regras por tela no artefato. O instrumento
agora registra o título e o tamanho do texto de cada tela (para "0 violações" não ser confundido
com página vazia) e mescla o resultado em vez de sobrescrever.

A cabine do motorista abria sem título de nível 1 (as subtelas de expedição devolvem antes do
cabeçalho do painel). Ganhou `<h1 class="sr-only">` — existe para leitor de tela, não ocupa pixel
no mapa.

Pedidos, produtos e notas ganharam legenda que diz a ordem que já tinham (número desc; ativos e
nome; data desc). Nenhuma das três ordena ao clique, então `aria-sort` não se aplica — o que
faltava era a ordem estar dita.
