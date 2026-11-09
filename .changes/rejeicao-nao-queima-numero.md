---
impacto: nada_mudou
secao: corrigido
titulo: Rejeição da SEFAZ não queima mais número de nota
---

Quando a SEFAZ recusava uma nota por validação — por exemplo IE do destinatário
não informada (232) ou não vinculada ao CNPJ (234) —, o número reservado era
tratado como se a nota tivesse chegado ao fisco. A reemissão pegava o número
seguinte e o recusado ficava como buraco na série, exigindo inutilização.

Agora a rejeição devolve o número ao contador: a nota fica com status de erro e,
ao ser reemitida depois da correção do cadastro, usa o MESMO número. Não há mais
buraco a inutilizar por causa de uma recusa.

Número que já existe no fisco (duplicidade 204/205/218/539) e resposta ambígua
(timeout ou lote em processamento) continuam sem devolução — nesses casos reusar
o número poderia duplicar o documento. Se outra emissão já tiver tomado o número
seguinte, a devolução falha e o número continua visível para inutilização.
