---
impacto: capacidade_nova
secao: adicionado
titulo: Endpoint dos orcamentos parados do Mercos com idade e proximo passo
---

GET /api/v1/commercial-orders/orcamentos-parados devolve, no recorte
origem=mercos e status=rascunho, numero, cliente, valor, idade em dias e um
proximo passo por linha. A regua de idade vem de organizations.settings com
padrao de 60 dias, nunca de numero escondido na tela.

O recorte que separa as medicoes de 119 e 124 orcamentos esta registrado no
documento 66: 124 e o total; 119 e o subconjunto criado pelo Mercos que
ninguem da equipe abriu.

Nada a fazer na VPS.
