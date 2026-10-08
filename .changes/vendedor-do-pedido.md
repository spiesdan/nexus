---
impacto: nada_mudou
secao: corrigido
titulo: Os pedidos passam a ter vendedor, e o nome aparece na tela
---

Um pedido criado na tela não ficava com o nome de quem criou. Com isso, o filtro
por vendedor não filtrava nada e o nome não aparecia no PDF do pedido, mesmo que
o sistema tivesse o campo pronto.

Medido antes da correção: dos 10.769 pedidos da instalação, nenhum tinha
vendedor registrado.

Agora:

- pedido feito na mão fica com o nome de quem criou;
- pedido que entra pelo WhatsApp, pela IA ou pelo portal B2B continua sem dono,
  porque não foi uma pessoa que vendeu;
- o filtro por vendedor mostra o nome da pessoa, e não um código interno;
- o nome passa a sair no PDF do pedido.

Pedidos que já existiam continuam como estão — este recurso vale para os novos.
Para o histórico, é preciso atribuir o vendedor a partir de quem criou cada um.
