---
impacto: nada_mudou
secao: corrigido
titulo: Tela de teste do agente não estoura mais o timeout
---

A tela de Teste abortava a chamada em 10 segundos enquanto o turno real leva
dezenas de segundos: cada retry rodava o agente de novo no servidor e a tela
terminava em "Erro inesperado". O timeout da chamada passou para 120 segundos.
Nada precisa ser feito na atualização.
