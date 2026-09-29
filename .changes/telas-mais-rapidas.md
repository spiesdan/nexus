---
impacto: nada_mudou
secao: alterado
titulo: Telas mais rápidas: home, inbox e indicadores
---

Abrir a home, a caixa de entrada e os indicadores ficou mais rápido. A moldura
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
