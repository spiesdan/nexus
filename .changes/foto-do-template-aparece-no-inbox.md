---
impacto: nada_mudou
secao: corrigido
titulo: A foto do template aparece no inbox junto da mensagem enviada
---

Mensagens de campanha por template com cabeçalho de imagem chegavam ao cliente
com a foto, mas no inbox do CRM apareciam só com o texto — não havia o que
renderizar, porque o arquivo é da campanha e não da mensagem.

Agora a referência do arquivo é guardada com a mensagem (sem entrar na cascata
de exclusão da LGPD, que apagaria a imagem compartilhada por toda a campanha),
e a bolha mostra a foto com o mesmo clique para ampliar das demais imagens.
