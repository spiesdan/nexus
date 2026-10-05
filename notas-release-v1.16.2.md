### Alterado

- **Telas mais rápidas: home, inbox e indicadores** Abrir a home, a caixa de entrada e os indicadores ficou mais rápido. A moldura
  da home deixou de esperar seis consultas em fila (agora correm em paralelo), os
  indicadores parou de varrer até 25 mil linhas e de perguntar o nome de cada
  membro da organização fora do ranking — o que cortou o tempo de renderização da
  tela de 11,8–17,1s para cerca de 0,5s na medição local — e a fila do inbox
  ganhou um índice parcial no par (organização, last_inbound_at) que casa com a
  ordenação que ela já usava. A navegação entre telas reaproveita o cache do
  roteador por 30s, os polls de conexão passaram de 10s para 30s (e o de versão
  de 5s para 60s enquanto não há atualização em andamento), e o Sentry parou de
  enviar traços de performance (erros e replays de erro continuam). Nada muda em
  regra, atalho ou permissão e ninguém precisa fazer nada para receber isto — é só
  mais rápido.

### Corrigido

- **Abas do inbox param de colidir em coluna estreita** Os filtros do inbox — Fila, Minhas, Todas, Fechadas, Automático — apareciam espremidos na coluna da lista, com o texto de uma aba invadindo a vizinha ("FechadasAutomático" colado, o contador grudado no rótulo seguinte). A causa era a geometria da faixa: ela dividia a largura em partes iguais que ficavam menores que o próprio rótulo — "Automático" mede mais que a coluna que lhe coube no xl, de 272px — e o texto centralizado transbordava para os dois lados. Agora a faixa usa a mesma estrutura da referência visual do produto: divisão igual em flex, com piso no tamanho do conteúdo, de modo que nenhuma aba encolhe abaixo do que ela escreve; e se um dia faltar largura, a faixa rola em vez de espremer o texto. O aperto horizontal também fechou para as cinco abas caberem sem rolagem na coluna mais estreita. É conserto visual apenas — nada muda em regra, atalho ou permissão, e ninguém precisa fazer nada para receber isto.