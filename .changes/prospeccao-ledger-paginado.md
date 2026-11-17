---
impacto: nada_mudou
secao: corrigido
titulo: Controle da campanha conta todos os envios, mesmo acima de 1000
---

O painel de controle da campanha e os cartões da lista liam o registro de
envios numa única consulta. O PostgREST corta a resposta em 1000 linhas — e
acima disso o controle mostrava empresas "faltando" que já tinham recebido, e
o cartão subcontava enviadas e faltantes.

Agora as duas leituras são paginadas, com a mesma ordem estável do motor
(`enviado_em, id`): o controle e a lista contam o que aconteceu de verdade.
O motor já lia o ledger inteiro; o que faltava era a tela.
