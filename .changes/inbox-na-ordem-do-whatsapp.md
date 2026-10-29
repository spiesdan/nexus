---
impacto: nada_mudou
secao: corrigido
titulo: A lista do Inbox segue a ordem do WhatsApp
---

A lista do Inbox não parecia ordenada por tempo, e a conversa não se comportava
como no WhatsApp. Eram três defeitos independentes, e o primeiro escondia os
outros dois.

A régua da lista não era a régua da linha: a aba Fila ordenava por entrada e a
linha mostrava a hora da última mensagem, então a resposta do atendente adiantava
a hora exibida sem mudar a posição — um item com 14:32 aparecia acima de outro
com 14:35. Agora todas as abas ordenam pela última mensagem, com desempate
estável, e o tempo de espera continua na linha como rótulo, sem fingir que
define prioridade.

O carimbo da conversa andava para trás: uma mensagem antiga que chegava depois
(fila do WhatsApp após reconexão, nova tentativa do webhook, importação de
histórico) levava a conversa para o passado e trocava a prévia por um texto
velho. O banco passa a só avançar as datas e a prévia só é substituída pela
mensagem mais nova, e a entrada de mensagens usa o horário do provedor.

A conversa abria no topo e não acompanhava o que chegava. Agora abre no fim,
acompanha mensagem nova quando você já está no fim, preserva a posição ao
carregar as antigas e oferece "ir para o fim" com contador quando você rolou
para cima. Mensagem repetida não vira bolha duplicada, e trocar de conversa não
herda a rolagem da anterior.

Nada a fazer na instalação: a atualização aplica a mudança de banco sozinha.
