---
impacto: nada_mudou
secao: corrigido
titulo: Sentinel mede a rodada e não deixa uma regra travar o cron
---

A varredura do Sentinel passa a ter um orçamento de tempo para a fase de
detecção. Se uma regra patológica estourar o teto, as seguintes não rodam, a
rodada é marcada como truncada e o Sentinel **não** encerra ocorrências por
ausência — lista incompleta não é prova.

O tempo medido fica no histórico da execução (não em coluna nova) e no log
estruturado. Medição desta entrega: 29 detectores sobre 2 mil de cada entidade
levam 7 ms; com 50 mil pedidos e 200 mil mensagens, o scan completo levou 1,1 s
e a detecção 37 ms. Forçando o orçamento a 0 ms no mesmo snapshot, a rodada
truncou e nenhuma regra foi avaliada — o teto de 8 s protege o cron de 15
minutos sem depender de o volume caber na memória.
