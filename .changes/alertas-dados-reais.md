---
impacto: nada_mudou
secao: corrigido
titulo: Três problemas que só apareciam com os dados reais da instalação
---

**Fechar um alerta não resolvia e o aviso voltava.** Um item marcado como tratado
que continuava valendo era registrado de novo a cada verificação — a cada dez
minutos. Além de encher a tela, a pessoa fechava o aviso e ele voltava, e a lição
que fica é que não adianta fechar nada.

**O aviso de pedido fora da carga nunca aparecia.** A comparação de cidade olhava o
endereço do cliente em vez do endereço de entrega do pedido — e o mesmo cliente pode
receber em outro lugar. Onde as duas informações existiam, a rotina não comparava as
cidades certas; onde o endereço de entrega estava preenchido, ela passava a comparar.

**O aviso de nota fiscal pendente apontava para o problema errado.** Ele dizia que
faltava configurar o provedor, mas o que impedia a emissão era o cadastro do
emitente incompleto. Quem seguia a indicação arrumava o provedor e a emissão
continuava barrada, sem explicação.

Agora o aviso lista tudo o que falta de uma vez, na ordem em que cada item
libera o próximo, e diz onde cada informação é obtida.