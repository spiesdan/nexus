---
impacto: nada_mudou
secao: adicionado
titulo: "Imprimir os pedidos de um dia, com o período em filtros de tela"
---

**Dá para escolher o dia e imprimir o lote.** Os campos "de" e "até" entraram
na linha de filtros da tela de pedidos, com atalhos para Hoje, Ontem e Últimos
7 dias. Escolher um dia preenche os dois campos — "todos os pedidos do dia
14/10" não é "de 14/10 até 14/10", é um dia, e escrever a mesma data nos dois
lugares é um erro silencioso quando se faz pela metade.

**O filtro de período já existia, e estava no fuso errado.** A tela enviava
`de`/`ate` para o servidor, e o servidor montava a janela em UTC:
`T00:00:00Z` a `T23:59:59.999Z`. Em Brasília isso cobre de 13/10 21:00 até 14/10
20:59 — traz três horas do dia anterior e perde três do dia pedido.

Não havia campo na tela para acionar isso, então ninguém tinha aparecido ainda.
Mas o dia em que alguém usasse — pelo drill-down do dashboard, pela URL — o
total não bateria, e nada indicava por quê: a lista abre, tem pedidos, tem data.

A janela agora sai de `lib/comercial/janela-do-dia.ts`, que converte a parede
local do dono no instante UTC correspondente, no fuso de `user.timezone`
(caindo para `America/Sao_Paulo`). Sem biblioteca nova: `Intl.DateTimeFormat` com
`timeZone`, que o repo já usa em `lib/lgpd/holidays-br.ts` e
`lib/lgpd/sla-alarm.ts`.

**O `ate` é exclusivo** — o primeiro instante do dia seguinte, em vez de
`23:59:59.999`. Um pedido gravado no último milissegundo do dia entra; o
`23:59:59.999` o deixaria de fora, e esse tipo de "quase" só aparece em
produção.

**O teto de 50 não é mais mudo**

O botão de imprimir continua levando no máximo 50 pedidos — é deliberado, e está
escrito em `lib/comercial/ids-do-lote.ts`: um PDF com 50 páginas é um arquivo;
500 é um arquivo que o navegador não fecha a tempo. O que mudou é que a tela
**diz**. Antes, um dia com 87 pedidos imprimia 50 e o dono não tinha como saber
que 37 ficaram de fora. Agora aparece "imprimindo os 50 mais recentes de 87".

E o `50` saiu de um literal solto na tela: agora vem de `idsDoLote`, a mesma
função que a página de impressão e a rota de PDF aplicam. Repetir o número é
como as duas pontas divergem — um dia o teto sobe para 60 e a tela continua
mandando 50, sem erro nenhum.

**Mutações provadas**

| mutação | reprova |
|---|---|
| a janela voltando a ser UTC | 8 testes do helper |
| a fronteira antiga na página, em código | 3 testes de arquivo |

Um detalhe sobre o teste de arquivo: a página tem um comentário que **cita** a
fronteira antiga ao explicar o conserto, e a primeira versão do teste reprovava
por causa da própria explicação — o que obrigaria a apagar a documentação para
o teste passar. O leitor tira comentário antes de buscar, e há um teste que
trava essa leitura.