---
impacto: nada_mudou
secao: corrigido
titulo: Leitor de tela encontra os campos e a contagem no shell offline
---

No shell offline, os campos de busca de cliente, busca de produto e observação
só tinham placeholder; o TalkBack lia o exemplo, não o nome do campo. Agora os
três têm nome acessível (`Buscar cliente`, `Buscar produto`, `Observação
(opcional)`).

A contagem da fila (“Fila de envio (1)”) é uma região viva e o cliente
escolhido/total são `status`: uma mudança é anunciada sem o foco sair do lugar.
O estado de conexão e o “aguardando envio” já estavam em palavra, não só em
cor.

Validado no emulador com TalkBack 16 ligado; a árvore de acessibilidade
pós-instalação expõe os nomes dos três campos. A fala exata não é registrada
pelo logcat — a prova de conteúdo é a árvore, e a de síntese é o TTS.
