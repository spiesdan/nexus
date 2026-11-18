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
estruturado. Medição desta entrega: 29 detectores sobre 2 mil produtos, 2 mil
pedidos, 2 mil recebíveis e 2 mil leads levam 7 ms nesta máquina; o teto padrão
é de 8 s, folga para o cron de 15 minutos.
