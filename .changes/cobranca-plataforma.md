---
impacto: nada_mudou
secao: adicionado
titulo: O dono da instalação vê quem está pagando e quem não está
---

Existia a tela de cobrança do próprio tenant, e não a da instalação: para saber
quais organizações tinham assinatura viva, quais estavam em atraso e quais nunca
assinaram, era preciso abrir tenant por tenant. Agora `/admin/billing` lista
todas — situação, valor do plano, próximo vencimento, última cobrança e a ação
(portal ou criar assinatura) — com quatro contagens no topo e a diferença
visível quando alguma organização está em estado não verificado.

A lista lê o banco local e diz há quanto tempo foi sincronizada: o Stripe é
chamado só no clique da ação, nunca organização por organização. Numa instalação
sem Stripe configurado a tela abre e explica isso numa faixa, com as ações
desativadas — não vira erro nem lista vazia. E organização que tem cliente no
Stripe mas cuja assinatura nunca foi lida aparece como **não verificada**, nunca
como "sem assinatura": ausência de leitura não é inadimplência.
