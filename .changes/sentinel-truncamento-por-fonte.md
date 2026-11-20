---
impacto: nada_mudou
secao: corrigido
titulo: Sentinel para de truncar por histórico Mercos e encerra por fonte
---

A coleta Mercos lia 30 dias para regras de 45 minutos e 24 horas; 137 execuções
em 30 dias estouravam o teto de 100 e bloqueavam o encerramento de todas as
regras. A janela passou a 7 dias (o horizonte das regras) e o teto a 500.
O bloqueio por truncamento agora é por fonte: importações Mercos truncadas
param só as regras Mercos, e fiscal/estoque/lead continuam encerrando.
