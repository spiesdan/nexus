---
impacto: nada_mudou
secao: corrigido
titulo: Manifestação e cancelamento não transmitem duas vezes
---

Manifestação de entrada e cancelamento de nota autorizada falavam com a SEFAZ
antes de qualquer trava: dois cliques simultâneos podiam registrar dois eventos
no órgão, um deles sem volta.

As duas operações passaram a reservar a transmissão no banco antes de sair. O
segundo clique recebe resposta de conflito (ou o resultado da primeira, se ela já
terminou), e a reserva de um processo morto é retomada depois de cinco minutos.
Nenhum status fiscal muda durante a reserva.
