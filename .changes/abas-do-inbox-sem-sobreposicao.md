---
impacto: nada_mudou
secao: corrigido
titulo: Abas do inbox param de colidir em coluna estreita
---

Os filtros do inbox — Fila, Minhas, Todas, Fechadas, Automático — apareciam espremidos na coluna da lista, com o texto de uma aba invadindo a vizinha ("FechadasAutomático" colado, o contador grudado no rótulo seguinte). A causa era a geometria da faixa: ela dividia a largura em partes iguais que ficavam menores que o próprio rótulo — "Automático" mede mais que a coluna que lhe coube no xl, de 272px — e o texto centralizado transbordava para os dois lados. Agora a faixa usa a mesma estrutura da referência visual do produto: divisão igual em flex, com piso no tamanho do conteúdo, de modo que nenhuma aba encolhe abaixo do que ela escreve; e se um dia faltar largura, a faixa rola em vez de espremer o texto. O aperto horizontal também fechou para as cinco abas caberem sem rolagem na coluna mais estreita. É conserto visual apenas — nada muda em regra, atalho ou permissão, e ninguém precisa fazer nada para receber isto.
