---
impacto: nada_mudou
secao: corrigido
titulo: Nota já autorizada não é transmitida de novo
---

A mesma nota podia ser enviada duas vezes e gerar dois documentos fiscais
válidos para uma venda só. Medido nesta instalação: o pedido 19631 recebeu as
NF-e 4641 e 4642, autorizadas com quatro minutos de diferença; a segunda
sobrescreveu número, chave e XML da linha, e a 4641 sumiu da tela mesmo
existindo na SEFAZ.

Agora o dreno relê a nota imediatamente antes de transmitir e encerra o job se
ela já saiu de `em_emissao` ou já tem chave de acesso. E, se a SEFAZ autorizar
uma segunda nota para a mesma linha, a primeira autorização é mantida: a
segunda vira um evento visível com as duas chaves e os dois protocolos, para
cancelamento no fisco — nunca uma substituição silenciosa.
