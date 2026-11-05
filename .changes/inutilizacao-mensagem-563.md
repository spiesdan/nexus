---
impacto: nada_mudou
secao: corrigido
titulo: Inutilização: o retorno 563 aparece uma vez só, e as três faixas antigas ficaram fechadas
---

O fechamento de uma inutilização já homologada (cStat **563 — "já existe pedido com a mesma faixa"**) escrevia o prefixo `SEFAZ [563]:` duas vezes no retorno da tela. Agora o texto é montado num lugar só.

As três inutilizações de 05/11 (lacunas **4580–4581, 4583 e 4587** da série 1) foram reconciliadas pelo próprio botão **Retransmitir**: estão `transmitida`, com o motivo da SEFAZ registrado. O protocolo original não foi capturado — ele se perdeu no bug do cStat 1002 (corrigido na 1.39.10) —, e a SEFAZ não devolve protocolo novo no reenvio de faixa já homologada; a consulta fica no portal da SEFAZ.
