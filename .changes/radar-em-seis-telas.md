---
impacto: nada_mudou
secao: alterado
titulo: O Radar vira seis telas, uma por pergunta
---

O Radar era uma página só, com sete blocos empilhados e cinco botões que
rolavam até eles. Para chegar em "quem está esfriando" era preciso atravessar
KPIs, gráficos, categorias, saúde da carteira, oportunidades, recompra,
recuperação e demandas — e nenhum botão dizia onde a pessoa estava, porque não
havia onde estar: tudo era a mesma página.

Agora cada pergunta tem endereço próprio, como já acontece na ficha da carga da
Expedição:

- **Visão geral** — como está a carteira e o que fazer hoje;
- **Categorias** — quem contatar, separado por motivo, com a próxima ação;
- **Oportunidades** — quem já comprou e está no ponto de comprar de novo;
- **Risco de demandas** — demandas abertas que esfriaram sem resposta;
- **Recuperação** — quem comprava e parou, por prioridade;
- **Prospecção** — quem podemos vender hoje, antes do primeiro pedido.

O recorte (busca, vendedor, cidade, período, nível) acompanha a navegação: quem
filtra uma cidade e troca de tela continua na cidade, e o endereço guarda o
recorte para o F5 e para mandar a alguém. Os números da visão geral levam para
a lista já recortada — clicar em "Em risco" abre as oportunidades naquela
situação, em vez de só rolar a tela.

Os links antigos continuam funcionando: `/app/recuperacao` e os endereços com
`#radar-recuperacao`, `#radar-demandas` e `#radar-prospeccao` caem nas telas
novas. Quem já instalou não precisa fazer nada.
